import { model, Schema } from 'mongoose'
import { v4 } from 'uuid'

const roomSchema = new Schema(
	{
		_id: {
			type: String,
			default: () => v4(),
		},
		name: String,
		owner: String,
		word: String,
		status: String,
		images: [],
		users: [
			{
				username: String,
				socketId: String,
				points: {
					type: Number,
					default: 0,
				},
				guessed: {
					type: Boolean,
					default: false,
				},
				index: {
					type: Number,
					default: 0,
				},
			},
		],
	},
	{ timestamps: true },
)

export const Room = model('Room', roomSchema)
