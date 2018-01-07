const express = require('express')
const app = express()
const TelegramBot = require('node-telegram-bot-api')
require('dotenv').config()
const CronJob = require('cron').CronJob
const steem = require('steem')
const request = require('request')
const fs = require('fs')

// Paths
const IMG_PATH = process.env.IMG_PATH
const STORY_PATH = process.env.STORY_PATH

/* app.get('/test', function (req, res) {
  getRewards('neronius')
  res.send('Test')
}) */

var server = app.listen(process.env.PORT, () => console.log('Neronius listening on port ' + process.env.PORT))

// setting build rpc node
steem.api.setOptions({ url: 'wss://rpc.buildteam.io' })

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {polling: true})

// Listen for any kind of message.
bot.on('message', (msg) => {
  if (msg.text.toString().toLowerCase().includes('/' + process.env.TELEGRAM_BOT_COMMAND)) {
    fs.readdir(IMG_PATH, (err, files) => {
      if (err) {
        console.error('[neronius-bot]', err)
        return
      }
      bot.sendMessage(msg.chat.id, 'My ready posts: ' + files.length)
      closeServer()
    })
  } else if (msg.text.toString().toLowerCase().includes('/voting_power')) {
    steem.api.getAccounts(['neronius'], function (err, result) {
      if (err) {
        console.error('[neronius-bot]', err)
        return
      }
      var secondsago = (new Date() - new Date(result[0].last_vote_time + 'Z')) / 1000
      var vpow = result[0].voting_power + (10000 * secondsago / 432000)
      vpow = Math.min(vpow / 100, 100).toFixed(2)
      bot.sendMessage(msg.chat.id, 'My current voting power: ' + vpow + '%')
      closeServer()
    })
  } else if (msg.text.toString().toLowerCase().includes('/money')) {
    steem.api.getAccounts(['neronius'], function (err, result) {
      if (err) {
        console.error('[neronius-bot]', err)
        return
      }
      steem.api.getDynamicGlobalProperties(function (err1, gprops) {
        const totalVestingFundSteem = parseFloat(gprops.total_vesting_fund_steem.replace(' STEEM', ''))
        const totalVestingShares = parseFloat(gprops.total_vesting_shares.replace(' VESTS', ''))
        const vestingShares = parseFloat(result[0].vesting_shares.replace(' VESTS', ''))
        const receivedVestingShares = parseFloat(result[0].received_vesting_shares.replace(' VESTS', ''))

        let totalSteemPower = (totalVestingFundSteem * ((vestingShares + receivedVestingShares) / totalVestingShares))

        if (totalSteemPower == null) {
          totalSteemPower = 0
        }
        var text = result[0].balance + '\n' + result[0].sbd_balance + '\n' + totalSteemPower.toFixed(3) + ' STEEM POWER'
        bot.sendMessage(msg.chat.id, text)
        closeServer()
      })
    })
  } else if (msg.text.toString().toLowerCase().includes('ping')) {
    bot.sendMessage(msg.chat.id, 'Pong')
    closeServer()
  }
})

function generatePost () {
  fs.readdir(IMG_PATH, function (err, items) {
    if (err) {
      console.error('[neronius-bot]', err)
      return
    }
    if (items && items.length > 0) {
      var filename = items[Math.floor(Math.random() * items.length)]
      console.log('[neronius-bot] try file: ' + filename)

      // remove the extension
      let rootFilename = filename.replace(/\.[^/.]+$/, '')

      // read story file with the same name of image
      fs.readFile(STORY_PATH + rootFilename + '.txt', 'utf8', function (err, data) {
        if (err) {
          console.error('[neronius-bot] missing story')
          // remove the image without associated story
          fs.unlink(IMG_PATH + filename, function (err, data) {
            if (err) {
              console.error('[neronius-bot]', err)
              return
            }
            console.log('[neronius-bot] file removed: ' + filename)
            // retry
            generatePost()
          })
        } else {
          getPostContent(rootFilename, data, filename)
        }
      })
    }
  })
}

function getPostContent (title, story, image) {
  var url = 'https://pictshare.net/backend.php'

  var formData = {
    postimage: fs.createReadStream(IMG_PATH + image)
  }

  // upload image on pictshare
  request.post({url: url, formData: formData}, function optionalCallback (err, httpResponse, body) {
    if (err) { return console.error('[neronius-bot] image upload failed: ' + image) }
    var parsed = JSON.parse(body)
    var url = parsed.domain + '/' + parsed.hash
    console.log('[neronius-bot] image ' + image + ' uploaded to ' + url)
    createPost(title, story, url)
  })
}

function createPost (title, story, urlImage) {
  let content = '<center>![](' + urlImage + ')</center> \n\n ' + story + ' \n\n --- \n\n This post was made by an artifical intelligence called Neronius'
  broadcastPost(title, content)
}

function broadcastPost (title, content) {
  /** Broadcast a post */
  var permlink = new Date().toISOString().replace(/[^a-zA-Z0-9]+/g, '').toLowerCase()
  const postLink = permlink + '-post'
  steem.broadcast.comment(
    process.env.AUTHOR_POSTING_WIF,
    '', // Leave parent author empty
    'story', // Main tag
    process.env.AUTHOR_USERNAME, // Author
    postLink, // Permlink
    title, // Title
    content, // Body
    { tags: ['neronius', 'technology', 'life', 'ai'], app: 'steemjs/examples' }, // Json Metadata
    function (err, result) {
      if (err) { return console.error('[neronius-bot] error broadcast post') }
      console.log('[neronius-bot] post uploaded: ' + postLink)
      sendMessage(postLink)
      votePost(postLink)
      removeFiles(title)
      closeServer()
    }
  )
}

function sendMessage (link) {
  var postLink = 'https://steemit.com/neronius/@' + process.env.AUTHOR_USERNAME + '/' + link
  bot.sendMessage(process.env.TELEGRAM_CHAT_ID, 'New post! ' + postLink)
}

function removeFiles (name) {
  fs.unlinkSync(IMG_PATH + name + '.jpg')
  fs.unlinkSync(STORY_PATH + name + '.txt')
}

function votePost (link) {
  // Vote post
  steem.broadcast.vote(
    process.env.AUTHOR_POSTING_WIF,
    process.env.AUTHOR_USERNAME, // Voter
    process.env.AUTHOR_USERNAME, // Author
    link, // Permlink
    10000, // Weight (10000 = 100%)
    function (err, result) {
      if (err) { return console.error('[neronius-bot] error vote post') }
      console.log('[neronius-bot] post upvoted')
    }
  )
}

function getRewards () {
  steem.api.getAccounts(['neronius'], function (err, response) {
    if (err) { console.error('[neronius-bot]', err) }
    let name = response[0]['name']
    let rewardSbd = response[0]['reward_sbd_balance'] // will be claimed as Steem Dollars (SBD)
    let rewardSteem = response[0]['reward_steem_balance'] // this parameter is always '0.000 STEEM'
    let rewardSteempower = response[0]['reward_vesting_steem'] // STEEM to be received as Steem Power (SP), see reward_vesting_balance below
    let rewardVests = response[0]['reward_vesting_balance'] // this is the actual VESTS that will be claimed as SP

    let rsbd = parseFloat(rewardSbd)
    let rspw = parseFloat(rewardSteempower) // Could also check for reward_vesting_balance instead

    // Claim rewards if there is SBD and/or SP to claim
    if (rsbd > 0 || rspw > 0) {
      let privateKey = process.env.AUTHOR_ACTIVE_KEY // Pulled from the JSON object in the CONFIG

      // steem.broadcast.claimRewardBalance(privateKey, name, reward_steem, '0.005 SBD', '10.000000 VESTS', function (err, response) { // for testing
      steem.broadcast.claimRewardBalance(privateKey, name, rewardSteem, rewardSbd, rewardVests, function (err, response) {
        if (err) {
          console.log('[neronius-bot] Error claiming reward')
        }
        if (response) {
          let operationResult = response.operations[0][1] // Get the claim_reward_balance JSON
          let confirmRewardSbd = operationResult.reward_sbd
          let confirmRewardVests = operationResult.reward_vests
          console.log('[neronius-bot]', 'claimed', confirmRewardSbd, 'and', rspw, 'SP (', confirmRewardVests, ')')
        }
      })
    }
  })
}

function closeServer () {
  setTimeout(() => {
    server.close(() => {
      process.exit(1)
    })
  }, process.env.CLOSE_DELAY)
}

// 0 a.m.
new CronJob('0 0 0 * * *', function () {
  console.log('[neronius-bot] post at 0:00 a.m.')
  generatePost()
  getRewards()
}, null, true, 'Europe/Rome')

// 2 a.m.
new CronJob('0 24 2 * * *', function () {
  console.log('[neronius-bot] post at 2:24 a.m.')
  generatePost()
  getRewards()
}, null, true, 'Europe/Rome')

// 4 a.m.
new CronJob('0 48 4 * * *', function () {
  console.log('[neronius-bot] post at 4:48 a.m.')
  generatePost()
  getRewards()
}, null, true, 'Europe/Rome')

// 6 a.m.
new CronJob('0 12 7 * * *', function () {
  console.log('[neronius-bot] post at 7:12 a.m.')
  generatePost()
  getRewards()
}, null, true, 'Europe/Rome')

// 8 a.m.
new CronJob('0 36 9 * * *', function () {
  console.log('[neronius-bot] post at 9:36 a.m.')
  generatePost()
  getRewards()
}, null, true, 'Europe/Rome')

// 10 a.m.
new CronJob('0 0 12 * * *', function () {
  console.log('[neronius-bot] post at 12:00 a.m.')
  generatePost()
  getRewards()
}, null, true, 'Europe/Rome')

// 0 p.m.
new CronJob('0 24 14 * * *', function () {
  console.log('[neronius-bot] post at 14:24 p.m.')
  generatePost()
  getRewards()
}, null, true, 'Europe/Rome')

// 2 p.m.
new CronJob('0 48 16 * * *', function () {
  console.log('[neronius-bot] post at 16:48 p.m.')
  generatePost()
  getRewards()
}, null, true, 'Europe/Rome')

// 4 p.m.
new CronJob('0 12 19 * * *', function () {
  console.log('[neronius-bot] post at 19:12 p.m.')
  generatePost()
  getRewards()
}, null, true, 'Europe/Rome')

// 6 p.m.
new CronJob('0 36 22 * * *', function () {
  console.log('[neronius-bot] post at 22:36 p.m.')
  generatePost()
  getRewards()
}, null, true, 'Europe/Rome')
