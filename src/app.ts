import express from 'express'
import mongoose from 'mongoose'
import http from 'http'
import fs from 'fs'
import google from 'googlethis'
import { Server } from 'socket.io'
import { Room } from './schemas/Room'
import path from 'path'
import dotenv from 'dotenv'
dotenv.config()

const app = express()

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const words = fs.readFileSync('words.txt').toString().split('\n')
mongoose.connect(process.env.MONGO_URI)

const server = http.createServer(app)
const io = new Server(server)

async function search(word) {
	const options = {
		page: 0,
		safe: true,
		additional_params: {
			// add additional parameters here, see https://moz.com/blog/the-ultimate-guide-to-the-google-search-parameters and https://www.seoquake.com/blog/google-search-param/
			hl: 'us',
		},
	}
	const response = await google.image(word, options)
	return response
}

app.use(express.static(path.join(__dirname, 'public')))
app.get('*', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

const clearDb = async () => {
	try {
		await Room.deleteMany({})
		console.log('Database cleared')
	} catch (error) {
		console.log(error)
	}
}

clearDb()

io.on('connection', (socket) => {
	const user = {
		id: socket.id,
		alias: 'Maettis' + Math.floor(Math.random() * 100),
	}

	let roomId

	socket.on('disconnect', async () => {
		console.log(`User ${user.alias} disconnected`)

		try {
			const room = await Room.findById(roomId)

			if (!room) {
				socket.emit('message', { message: 'Room does not exist!' })
				return
			}

			// If there are no users left in the room, delete it
			if (room.users.length === 1) await Room.findByIdAndDelete(roomId)
			else {
				// Remove user from room
				const updateRoom = await Room.findByIdAndUpdate(
					roomId,
					{
						$pull: {
							users: { socketId: user.id },
						},
					},
					{ new: true },
				)

				// Emit all users in room to user in room
				io.to(roomId).emit('users', { users: updateRoom.users })
				room.save()
			}

			socket.leave(roomId)
			io.to(roomId).emit('message', { message: `${user.alias} has left the room.` })
		} catch (error) {
			console.log(error)
			socket.emit('message', { message: 'Error while disconnecting!' })
		}
	})

	socket.on('create', async () => {
		const room = await Room.create({
			name: 'Room',
			owner: user.id,
			images: [],
			users: [
				{
					name: user.alias,
					socketId: user.id,
					points: 0,
					index: 0,
				},
			],
			word: '',
		})

		roomId = room._id
		socket.join(room._id)
		socket.emit('created', { room: room._id })

		io.to(user.id).emit('users', {
			users: [
				{
					username: user.alias,
					score: 0,
				},
			],
		})
	})

	socket.on('join', async (data) => {
		roomId = data.room

		try {
			// Find room in mongodb with id = roomId
			let room = await Room.findById(roomId)

			if (!room) {
				socket.emit('message', { message: 'Room does not exist!' })
				return
			}

			socket.join(roomId)

			// Check if user is already in room
			const index = room.users.findIndex((u) => u.socketId == user.id)

			if (index == -1) {
				room = await Room.findByIdAndUpdate(
					roomId,
					{
						$push: {
							users: {
								name: user.alias,
								socketId: user.id,
								points: 0,
								index: 0,
								guessed: false,
							},
						},
					},
					{ new: true },
				)

				socket.emit('joined', { room: roomId, owner: room.owner == user.id ? true : false, users: room.users, status: room.status })
				io.to(roomId).emit('message', { message: `${user.alias} has joined the room.` })
			} else {
				socket.emit('joined', { room: roomId, owner: room.owner == user.id ? true : false, users: room.users, status: room.status })
			}

			// Emit all users in room to user in room
			let users = []

			room.users.forEach((u) => {
				users.push({
					name: u.username,
					points: u.points,
				})
			})

			io.to(roomId).emit('users', { users: users })
		} catch (error) {
			console.log(error)
			socket.emit('message', { message: 'Error while joining room!' })
		}
	})

	const didAllUsersGuessed = async (roomId) => {
		// Check if all users are guessed
		const room = await Room.findById(roomId)
		const allGuessed = room.users.every((user) => user.guessed)
		if (allGuessed) {
			// Set room status to finished
			const word = words[Math.floor(Math.random() * words.length)]
			const images = await search(word)
			const image = images.slice(0, 4)

			const newRoom = await Room.findByIdAndUpdate(
				roomId,
				{
					word: word?.replace(/\r/g, ''),
					images: image,
					status: 'started',
					users: room.users.map((user) => {
						return {
							...JSON.parse(JSON.stringify(user)),
							guessed: false,
							index: 0,
						}
					}),
				},
				{ new: true },
			)

			console.log(newRoom)

			io.in(roomId).emit('message', { message: `The word was`, word: room.word })
			io.to(roomId).emit('image', { url: image[0]?.url, index: 0 })
		}
	}

	socket.on('chat', async (data) => {
		// Check if message = word of room
		try {
			const room = await Room.findById(roomId)

			if (!room) {
				socket.emit('message', { message: 'Room does not exist!' })
				return
			}

			if (room.status !== 'started') {
				io.in(roomId).emit('chat', { message: data.message, user: user.alias || user.id, success: false })
				return
			}

			const guser = room.users.find((u) => u.socketId == user.id)
			if (guser.guessed) {
				socket.emit('message', { message: 'You already guessed the word!' })
				return
			}

			if (room.word.toLowerCase() == data.message.toLowerCase()) {
				// Set User as guessed
				room.users.forEach((user) => {
					if (user.socketId == socket.id) user.guessed = true
				})

				io.to(user.id).emit('won')
				io.in(roomId).emit('message', { message: `${user.alias} has guessed the word!` })

				await didAllUsersGuessed(room._id)
			} else {
				io.in(roomId).emit('chat', { message: data.message, user: user.alias || user.id, success: false })

				const updatedRoom = await Room.findByIdAndUpdate(
					roomId,
					{
						users: room.users.map((u) => {
							if (u.socketId == user.id) {
								u.index++
							}
							return u
						}),
					},
					{ new: true },
				)

				const index = updatedRoom.users.find((u) => u.socketId == user.id).index

				if (index < 4) io.to(user.id).emit('image', { url: room.images[index]?.url, index: index })
				else {
					io.to(user.id).emit('loose')

					await Room.findByIdAndUpdate(roomId, {
						users: room.users.map((u) => {
							if (u.socketId == user.id) {
								u.guessed = true
							}
							return u
						}),
					})

					await didAllUsersGuessed(room._id)
				}
			}
		} catch (error) {
			console.log(error)
			socket.emit('message', { message: 'Error while sending message!' })
		}
	})

	socket.on('alias', async (data) => {
		try {
			const room = await Room.findById(roomId)

			if (!room) {
				socket.emit('message', { message: 'Room does not exist!' })
				return
			}

			const updatedRoom = await Room.findByIdAndUpdate(
				roomId,
				{
					users: room.users.map((u) => {
						if (u.socketId == user.id) {
							u.username = data.alias
						}
						return u
					}),
				},
				{ new: true },
			)

			io.to(roomId).emit('users', { users: updatedRoom.users })
		} catch (error) {
			console.log(error)
			socket.emit('message', { message: 'Error while setting alias!' })
		}
	})

	socket.on('start', async (data) => {
		try {
			const room = await Room.findById(roomId)

			if (!room) {
				socket.emit('message', { message: 'Room does not exist!' })
				return
			}

			if (room.owner != user.id) {
				socket.emit('message', { message: 'You are not the owner of the room!' })
				return
			}

			const word = words[Math.floor(Math.random() * words.length)]
			const images = await search(word)
			const image = images.slice(0, 4)

			await Room.findByIdAndUpdate(roomId, {
				word: word?.replace(/\r/g, ''),
				images: image,
				status: 'started',
				users: room.users.map((user) => {
					return {
						...user,
						guessed: false,
						index: 0,
					}
				}),
			})

			io.to(roomId).emit('image', { url: image[0]?.url, index: 0 })
			io.to(roomId).emit('message', { message: 'The game has started!' })
		} catch (error) {
			console.log(error)
			socket.emit('message', { message: 'Error while starting game!' })
		}
	})
})

server.listen(3000, () => {
	console.log('App running on Port 3000')
})
