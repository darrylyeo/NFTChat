require('dotenv').config()

const crypto = require('crypto')
const ethers = require('ethers')
const fetch = require('node-fetch')


const covalentChains = {
	1: 'Ethereum',
	137: 'Polygon',
	56: 'Binance Smart Chain',
	43114: 'Avalanche C-Chain'
}


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
							name: 'list',
							description: 'List your NFTs.',
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
	
	const loginMessageResult = await bot.kvstore.get(keyValueStoreTeamKey, 'nftchat_loginMessage', senderUsername)
	const isLoggingIn = bot.kvstore.isPresent(loginMessageResult)
	
	if(command === '!login'){
		if(await startLogin())
			await listNFTs()
	}
	else if(command === '!list'){
		if(!(await listNFTs()))
			await startLogin()
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
		await bot.kvstore.put(keyValueStoreTeamKey, 'nftchat_loginMessage', senderUsername, loginMessage).catch(console.error)

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
			return false
		}
		console.log({address, msg, sig, loginMessage})

		// Verify signature
		if(
			address && msg && sig &&
			console.log(address.toLowerCase(), ethers.utils.verifyMessage(loginMessage, sig).toLowerCase())||
			address.toLowerCase() === ethers.utils.verifyMessage(loginMessage, sig).toLowerCase()
		){
			await bot.kvstore.delete(keyValueStoreTeamKey, 'nftchat_loginMessage', senderUsername).catch(console.error)				
			await deleteMessage(incomingMessage).catch(console.error)

			await bot.kvstore.put(keyValueStoreTeamKey, 'nftchat_ethereumAddress', senderUsername, address)
			await send(`You are now logged in with your Ethereum address: ${address}`)

			return true
		}else{
			await deleteMessage(incomingMessage).catch(console.error)

			await send(`Oops, that signature is invalid! Try again.`)

			return false
		}
	}

	async function listNFTs(){
		const ethereumAddressResult = await bot.kvstore.get(keyValueStoreTeamKey, 'nftchat_loginMessage', senderUsername)
		if(!bot.kvstore.isPresent(ethereumAddressResult))
			return false

		const address = ethereumAddressResult.entryValue
		await send(`Your wallet address is ${address}.`)
		await send(`Searching your wallet for NFTs...`)

		const nfts = (
			await Promise.all(
				Object.keys(covalentChains).map(async chainID =>
					fetch(`https://api.covalenthq.com/v1/${chainID}/address/${address}/balances_v2/?nft=true&key=${process.env.COVALENT_API_KEY}`)
						.then(r => r.json())
						.then(result => {
							console.log('nfts', chainID, address, result)
							return result.data.items.filter(tokenBalance => tokenBalance.type === 'nft')
							// return result.items.filter(tokenBalance => tokenBalance.supports_erc.includes('erc721') || tokenBalance.supports_erc.includes('erc1155'))
						})
						.catch(e => {
							console.error(e)
							return []
						})
				)
			)
		).flat()

		if(nfts.length){
			const uniqueNFTs = nfts.reduce((count, nft) => count + (nft.nft_data ? nft.nft_data.length : 1), 0)
			console.log(uniqueNFTs)
			await send(`Found ${uniqueNFTs} unique NFTs across ${nfts.length} NFT collections:`)
			for(const nft of nfts){
				await send(`[${nft.contract_ticker_symbol}] ${nft.contract_title}${
					nft.nft_data
						? `(${nft.nft_data.length === 1
							? nft.nft_data.external_url.name
							: `${nft.nft_data.length} items`
						})`
						: ''
				}`)
			}
		}else{
			console.log(uniqueNFTs)
		}

		return true
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
		console.log(body)
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