require('dotenv').config()

const crypto = require('crypto')
const ethers = require('ethers')

const Bot = require('keybase-bot')
const bot = new Bot()

const keyValueStoreTeamKey = undefined // process.env.KB_TEAMNAME

async function main() {
	try {
		const username = process.env.KB_USERNAME
		const paperkey = process.env.KB_PAPERKEY
		await bot.init(username, paperkey)

		const info = bot.myInfo()
		console.log(`Bot initialized with username ${info.username}.`)

		await bot.chat.clearCommands()
		await bot.chat.advertiseCommands({
			advertisements: [
				{
					type: 'public',
					commands: [
						{
							name: 'login',
							description: 'Sign in with an Ethereum wallet address to access exclusive chatrooms for your NFTs.',
							usage: '',
						},
						{
							name: 'join',
							description: 'Join a chatroom for your NFTs.',
							usage: '[nft]',
						},
					],
				},
			],
		})

		
		console.log(`Listening for messages...`)
		await bot.chat.watchAllChannelsForNewMessages(onMessage, onError)
	} catch (error) {
		console.error(error)
	}
}

async function onMessage(incomingMessage){
	if (incomingMessage.content.type !== 'text')
		return


	const senderUsername = incomingMessage.sender.username
	const incomingMessageText = incomingMessage.content.text.body
	const [command, ...params] = incomingMessageText.split(' ')
	
	const loginMessageResult = await bot.kvstore.get(keyValueStoreTeamKey, 'loginMessage', senderUsername)
	const isLoggingIn = await bot.kvstore.isPresent(loginMessageResult)
	
	if(command === '!login'){
		if(await startLogin())
			await listNFTs()
	}
	else if(command === '!list'){
		await listNFTs()
	}
	else if(command === '!join'){
		await joinRoom(...params)
	}
	else if(isLoggingIn){
		await logIn(incomingMessageText)
	}


	async function startLogin(){
		// Generate login code
		// const messageToSign = `NFTChat_Login_${senderUsername}_${new Date().toISOString().slice(0, 10)}`
		const loginMessage = `NFTChatLogin_${crypto.randomBytes(32).toString('hex')}`
		await bot.kvstore.put(keyValueStoreTeamKey, 'loginMessage', senderUsername, loginMessage).catch(console.error)

		await send(`Welcome to NFTChat! Here you can use your NFTs to join exclusive chatrooms with fellow NFT creators/collectors.`)
		await send(`Here's how to log in:\n1) Go to https://www.myetherwallet.com/interface/sign-message\n2) Connect the Ethereum wallet you use to mint/collect NFTs\n3) Copy/paste the following message and sign it:`)
		await send(`\`${loginMessage}\``)
		await send(`4) Copy/paste the resulting signature back here.\n(It should look something like this: \`{"address": ..., "msg": ..., "sig": ...}\`)`)
	}

	async function logIn(signatureData){
		const loginMessage = loginMessageResult.entryValue
		const json = signatureData.trim()

		let address, msg, sig
		try {
			({address, msg, sig} = JSON.parse(json))
		}catch(e){
			console.error(e)
			await send(`Oops, I wasn't able to read that signature! Try again.`)
		}
		console.log({address, msg, sig, loginMessage})

		// Verify signature
		if(
			address && msg && sig &&
			console.log(address.toLowerCase(), ethers.utils.verifyMessage(loginMessage, sig).toLowerCase())||
			address.toLowerCase() === ethers.utils.verifyMessage(loginMessage, sig).toLowerCase()
		){
			await bot.kvstore.delete(keyValueStoreTeamKey, 'loginMessage', senderUsername).catch(console.error)
			await deleteMessage(incomingMessage).catch(console.error)

			await send(`You are now logged in with your Ethereum address: ${address}`)

			return true
		}else{
			await deleteMessage(incomingMessage).catch(console.error)
			console.log(4)

			await send(`Oops, that signature is invalid! Try again.`)
		}
	}

	async function joinRoom(){
		await bot.team.addMembers({
			team: 'nftchattest',
			usernames: [
				{username: senderUsername, role: 'writer'}
			],
		}).then(res => console.log(res))
	}

	async function send(body){
		return await bot.chat.send(incomingMessage.conversationId, {body})
	}
	async function deleteMessage(message){
		console.log('message', message)
		await bot.chat.delete(message.conversationId, message.id)
	}
}

async function onError(error){
	console.error(error)
}

async function shutDown() {
	await bot.deinit()
	process.exit()
}

process.on('SIGINT', shutDown)
process.on('SIGTERM', shutDown)

main()