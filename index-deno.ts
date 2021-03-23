// import { createRequire } from "https://deno.land/std/node/module.ts";

// const require = createRequire(import.meta.url);


// const Bot = require('keybase-bot')


// import Bot from "https://dev.jspm.io/keybase-bot"
import Bot from 'https://cdn.skypack.dev/keybase-bot'


console.log(Bot)
async function main() {
    const bot = new Bot()
    await bot.init('usernameX', 'some paper key...')
    /* now you can do things with the bot */
    await bot.deinit() // when done
}
main()
