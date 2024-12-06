const imgs = document.getElementById('images')
const cont = document.getElementById('cont')
var socket = io()

const mes_container = document.getElementById('message')
const sub_container = document.getElementById('subtitle')
const loa_container = document.getElementById('loading')
const points = document.getElementById('points')

const startbtn = document.getElementById('start')

let shown = false
function showMessage(message, subtitle) {
	if (shown == true) return
	mes_container.innerText = message
	sub_container.innerText = subtitle
	shown = true
	loa_container.style.display = 'grid'
}

function hideMessage() {
	if (shown == false) return
	shown = false
	loa_container.style.display = 'none'
}

socket.on('disconnect', (msg) => {
	showMessage('Reconnecting...', 'Please make sure you have an internet connection :)')
})
socket.on('connect', () => {
	hideMessage()
	start()
})

loading = true
const game = {
	startLoading: () => {
		loading = true
		imgs.classList.add('isloading')
	},
	stoploading: () => {
		loading = false
		imgs.classList.remove('isloading')
	},
}
var word
let res = null
let room
const questionmark = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Question_mark_%28black%29.svg/2048px-Question_mark_%28black%29.svg.png'
async function start() {
	const allimgs = imgs.getElementsByClassName('simgage')
	for (let i = 0; i < 4; i++) allimgs[i].style.backgroundImage = `url(${questionmark})`
	game.startLoading()
	// Check if url is /join/
	const url = window.location.href
	if (url.includes('/room/')) {
		room = url.split('/room/')[1]
		socket.emit('join', { room: room })
	} else {
		socket.emit('create')
	}
}

function increasePoints(increase) {
	const point = document.createElement('div')
	point.classList.add('point')
	point.innerHTML = increase
	points.appendChild(point)
	setTimeout(() => {
		point.remove()
	}, 1990)
}

function writeMessage(mess, word) {
	const message = document.createElement('div')
	message.classList.add('divider')
	message.innerText = mess
	if (word != undefined) {
		const word_div = document.createElement('div')
		word_div.classList.add('word')
		word_div.innerText = word
		message.appendChild(word_div)
	}
	cont.appendChild(message)
}

function reset() {
	const allimgs = imgs.getElementsByClassName('simgage')
	for (let i = 0; i < 4; i++) allimgs[i].style.backgroundImage = `url(${questionmark})`
}

const invite = document.getElementById('invite')
invite.addEventListener('click', () => {
	navigator.clipboard.writeText(`${window.location.href}`)
	invite.innerText = 'Copied to clipboard!'
	setTimeout(() => {
		invite.innerText = 'Invite friends'
	}, 3000)
})

socket.on('message', (data) => {
	writeMessage(data.message, data.word)
})
socket.on('chat', (data) => {
	const msg = data.message
	const message = document.createElement('div')
	message.classList.add('message')
	const content = document.createElement('div')
	content.classList.add('content')
	content.innerText = msg
	const date = document.createElement('div')
	date.classList.add('date')
	const d = new Date()
	const h = d.getHours()
	const m = d.getMinutes()
	date.innerText = `${h}:${m} - ${data.user}`
	message.appendChild(content)
	message.appendChild(date)
	if (data.success == true) message.classList.add('success')
	cont.appendChild(message)
	cont.scrollTop = cont.scrollHeight
})
socket.on('created', (data) => {
	room = data.room
	console.log(`Created room: ${room}`)
	window.history.replaceState({}, '', '/room/' + room)
})
socket.on('joined', (data) => {
	room = data.room
	console.log(`Joined room: ${room}`)
	// Check if userid is the owner
	if (data.owner != data.userid) startbtn.style.display = 'none'
})
socket.on('users', (data) => {
	const users = data.users
	const users_div = document.getElementById('users')
	users_div.innerHTML = ''
	users.forEach((user) => {
		// 27px
		const index = users.indexOf(user)
		const user_div = document.createElement('div')
		user_div.classList.add('user')
		user_div.innerText = `${index + 1}.  ${user.username}`
		users_div.appendChild(user_div)
	})
})
socket.on('image', (data) => {
	console.log(data)
	imgs.getElementsByClassName('simgage')[data.index].style.backgroundImage = `url(${data.url})`
	game.stoploading()
})
socket.on('loose', () => {
	reset()
	game.startLoading()
	writeMessage('You lost this round... - Waiting for other players.')
})
socket.on('won', () => {
	reset()
	game.startLoading()
})

function newMessage(element) {
	if (event.keyCode != 13 || element.value.length < 2) return
	socket.emit('chat', { message: element.value, room: room })
	element.value = ''
}

const skip = document.getElementById('skip')
skip.addEventListener('click', () => {
	/* writeMessage(`Skipped - The word was `, word)
    increasePoints(-200)
    start() */
})
startbtn.addEventListener('click', () => {
	socket.emit('start', { room: room })
	startbtn.style.display = 'none'
})
