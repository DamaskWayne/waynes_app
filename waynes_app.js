const { VK } = require('vk-io')
const sqlite3 = require('sqlite3').verbose()
const { setInterval } = require('timers')

const vk = new VK({
	token:
		'vk1.a.Q9NkX2X7k4yvab34BKje68dL3oPj4PJASDuRlG6i2zmxz_QAyM3HK8D7vAM13nXeqyiInnEeC-RhjrM8-2S2KhiJ30WcnTKBoV928ugwl4VodYBiKChgq9UDwBULA6GsQ-cuPnzT8WYuy9AhaMnLtvXo0sUvjUkrsUeXLQa5BbB5nx1DyP4nJplvlQTx9OM1Ov2xn5VKxQ5o1_b1uGbJ4g',
})

const db = new sqlite3.Database('users.db')

const oneHour = 3600 // 1 час в секундах
const twoHours = 7200 // 2 часа в секундах

db.serialize(() => {
	db.run(
		'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, vk_id INTEGER, nickname TEXT, status TEXT, wcoin INTEGER, rating INTEGER DEFAULT 0, last_bonus_timestamp INTEGER DEFAULT 0, last_shovel_purchase_timestamp INTEGER DEFAULT 0, rewards INTEGER DEFAULT 0)'
	)

	db.run(
		'CREATE TABLE IF NOT EXISTS promocodes (code TEXT PRIMARY KEY, wcoin INTEGER)'
	)

	db.run(
		'CREATE TABLE IF NOT EXISTS used_promocodes (user_id INTEGER, code TEXT, PRIMARY KEY (user_id, code))'
	)

	db.run(
		'CREATE TABLE IF NOT EXISTS cases (id INTEGER PRIMARY KEY, vk_id INTEGER, common INTEGER DEFAULT 0, silver INTEGER DEFAULT 0, gold INTEGER DEFAULT 0, platinum INTEGER DEFAULT 0, wayne INTEGER DEFAULT 0)'
	)

	db.run(`CREATE TABLE IF NOT EXISTS rooms (
        id INTEGER PRIMARY KEY,
        room_name TEXT,
        creator_id INTEGER,
        wcoin_amount INTEGER,
        player1_id INTEGER,
        player2_id INTEGER,
        status TEXT DEFAULT 'open'
    )`)

	db.run(
		'CREATE TABLE IF NOT EXISTS shovels (id INTEGER PRIMARY KEY, vk_id INTEGER, common INTEGER DEFAULT 0, silver INTEGER DEFAULT 0, gold INTEGER DEFAULT 0, platinum INTEGER DEFAULT 0, wayne INTEGER DEFAULT 0)'
	)

	db.run(
		'CREATE TABLE IF NOT EXISTS user_items (user_id INTEGER, item_name TEXT, quantity INTEGER, PRIMARY KEY (user_id, item_name))'
	)

	db.run(
		'CREATE TABLE IF NOT EXISTS market (user_id INTEGER, item_name TEXT, quantity INTEGER, price INTEGER, PRIMARY KEY (user_id, item_name))'
	)

	db.run(`
        CREATE TABLE IF NOT EXISTS clans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            creator_id INTEGER,
            balance INTEGER DEFAULT 0,
            wins INTEGER DEFAULT 0,
            losses INTEGER DEFAULT 0,
			health INTEGER DEFAULT 1000,
            last_battle_timestamp INTEGER DEFAULT 0
        )
    `)

	db.run(`
        CREATE TABLE IF NOT EXISTS clan_members (
            user_id INTEGER,
            clan_id INTEGER,
            PRIMARY KEY (user_id, clan_id)
        )
    `)

	db.run(`
        CREATE TABLE IF NOT EXISTS clan_battles (
            clan_id INTEGER,
            enemy_name TEXT,
            enemy_health INTEGER DEFAULT 1000,
            clan_health INTEGER DEFAULT 1000,
            last_battle_timestamp INTEGER DEFAULT 0
        )
    `)
})

// Item
const itemList = [
	'Фрагменты WCoin',
	'Легкая аптечка',
	'Большая аптечка',
	'Золотой меч',
	'Ведро воды',
	'Посох Wayne',
	'Зелье огня',
	'Платиновая стрела',
]

// Shovels
const shovelPrices = {
	обычная: 20,
	серебряная: 50,
	золотая: 100,
	платиновая: 300,
	wayneлопата: 700,
}

const shovelRewards = {
	обычная: { attempts: 1, min: 15, max: 40 },
	серебряная: { attempts: 1, min: 45, max: 65 },
	золотая: { attempts: 1, min: 95, max: 120, case: 'common' },
	платиновая: { attempts: 1, min: 255, max: 330, case: 'silver' },
	wayneлопата: { attempts: 1, min: 685, max: 730, case: 'gold' },
}

const shovelTypes = {
	обычная: 'common',
	серебряная: 'silver',
	золотая: 'gold',
	платиновая: 'platinum',
	wayneлопата: 'wayne',
}

// Cases
const caseRewards = {
	common: {
		wcoin: [150, 200, 250],
		items: [
			'40.000$',
			'50.000$',
			'60.000$',
			'Гитара на спину',
			'Бананка "Supreme"',
		],
	},
	silver: {
		wcoin: [450, 550, 700],
		items: [
			'60.000$',
			'80.000$',
			'110.000$',
			'Щелкунчик на спину',
			'Крест на спину',
		],
	},
	gold: {
		wcoin: [450, 500, 750, 800],
		items: [
			'130.000$',
			'150.000$',
			'190.000$',
			'Мишка на спину',
			'Конфета на спину',
			'Подарок на спину',
		],
	},
	platinum: {
		wcoin: [1700, 1900, 2200],
		items: [
			'200.000$',
			'300.000$',
			'400.000$',
			'Фредди',
			'Айсмен',
			'Арабский Шейх',
			'Бустер',
		],
	},
	wayne: {
		wcoin: [2500, 2900, 3200],
		items: ['700.000$', '820.000$', '900.000$', 'Дрейк', 'Литвин', 'Илон Маск'],
	},
}

const caseTypes = {
	обычный: 'common',
	серебряный: 'silver',
	золотой: 'gold',
	платиновый: 'platinum',
	wayne: 'wayne',
}

const registrationStates = {}

// Randomaizer (1 Cases) (2 Shovels)
function getRandomReward(caseType) {
	const rewards = caseRewards[caseType]
	const allRewards = rewards.wcoin.concat(rewards.items)
	const randomIndex = Math.floor(Math.random() * allRewards.length)
	const reward = allRewards[randomIndex]
	console.log(`Случайное вознаграждение: ${reward}`)
	return reward
}

// Функция для вычисления приза
function calculateReward(shovel) {
	const min = shovel.min
	const max = shovel.max
	const reward = Math.floor(Math.random() * (max - min + 1)) + min
	return reward
}

// Account
// Функция обновления баланса WCoin
async function updateUserWcoin(userId, amount) {
	return new Promise((resolve, reject) => {
		db.run(
			'UPDATE users SET wcoin = wcoin + ? WHERE vk_id = ?',
			[amount, userId],
			err => {
				if (err) reject(err)
				else resolve()
			}
		)
	})
}

async function updateUserNickname(vk_id, newNickname) {
	return new Promise((resolve, reject) => {
		const stmt = db.prepare('UPDATE users SET nickname = ? WHERE vk_id = ?')
		stmt.run(newNickname, vk_id, function (err) {
			if (err) {
				reject(err)
			} else {
				console.log(`Ник пользователя ${vk_id} изменен на ${newNickname}`)
				resolve()
			}
		})
		stmt.finalize()
	})
}

async function updateUserRewards(vk_id, reward) {
	return new Promise((resolve, reject) => {
		const stmt = db.prepare(
			'UPDATE users SET wcoin = wcoin + ? WHERE vk_id = ?'
		)
		stmt.run(reward, vk_id, function (err) {
			if (err) {
				reject(err)
			} else {
				console.log(`Обновлено количество WCoin для пользователя ${vk_id}`)
				resolve()
			}
		})
		stmt.finalize()
	})
}

async function resolveUserId(target) {
	if (target.startsWith('@')) {
		const screenName = target.slice(1)
		try {
			const response = await vk.api.users.get({ user_ids: screenName })
			if (response.length > 0) {
				return response[0].id
			}
		} catch (error) {
			console.error('Error resolving user ID by @mention:', error)
		}
	} else if (!isNaN(target)) {
		return parseInt(target, 10)
	} else if (target.startsWith('https://vk.com/')) {
		const screenName = target.slice(15) // remove "https://vk.com/"
		try {
			const response = await vk.api.utils.resolveScreenName({
				screen_name: screenName,
			})
			if (response.type === 'user') {
				return response.object_id
			}
		} catch (error) {
			console.error('Error resolving user ID by profile link:', error)
		}
	} else {
		try {
			const response = await vk.api.utils.resolveScreenName({
				screen_name: target,
			})
			if (response.type === 'user') {
				return response.object_id
			}
		} catch (error) {
			console.error('Error resolving user ID by profile name:', error)
		}
	}
	return null
}

async function getUser(vk_id) {
	return new Promise((resolve, reject) => {
		db.get('SELECT * FROM users WHERE vk_id = ?', [vk_id], (err, row) => {
			if (err) {
				reject(err)
			} else {
				// Если пользователь не найден, возвращаем null
				if (!row) {
					resolve(null)
				} else {
					// Если last_shovel_purchase_timestamp отсутствует, устанавливаем его в 0
					if (!row.last_shovel_purchase_timestamp) {
						row.last_shovel_purchase_timestamp = 0
					}
					resolve(row)
				}
			}
		})
	})
}

async function addUser(vk_id, nickname, status, wcoin) {
	return new Promise((resolve, reject) => {
		const stmt = db.prepare(
			'INSERT INTO users (vk_id, nickname, status, wcoin) VALUES (?, ?, ?, ?)'
		)
		stmt.run(vk_id, nickname, status, wcoin, function (err) {
			if (err) {
				reject(err)
			} else {
				console.log(`Добавлен пользователь ${vk_id} с WCoin: ${wcoin}`)
				resolve()
			}
		})
		stmt.finalize()
	})
}

async function getAllUsers() {
	return new Promise((resolve, reject) => {
		db.all('SELECT * FROM users', (err, rows) => {
			if (err) {
				reject(err)
			} else {
				resolve(rows)
			}
		})
	})
}

async function getUserWcoin(userId) {
	return new Promise((resolve, reject) => {
		db.get(`SELECT wcoin FROM users WHERE vk_id = ?`, [userId], (err, row) => {
			if (err) {
				reject(err)
				return
			}
			resolve(row ? row.wcoin : 0)
		})
	})
}

async function getUserNickname(vk_id) {
	return new Promise((resolve, reject) => {
		db.get(
			`SELECT nickname FROM users WHERE vk_id = ?`,
			[vk_id],
			(err, row) => {
				if (err) {
					reject(err)
					return
				}
				resolve(row ? row.nickname : 'Неизвестно')
			}
		)
	})
}

// Обновление функции handle выдачи WCoin
async function handleGrantWcoin(context, target, wcoinAmount) {
	const wcoin = parseInt(wcoinAmount, 10)
	const userId = context.senderId

	if (isNaN(wcoin) || !target) {
		await context.send(
			`${await getUserMention(
				userId
			)}, ❌ Неверный формат команды. Используйте: /выдать [ID/@ссылка на профиль(затем "@" уберите)] [сумма]`
		)
		return
	}

	const targetUserId = await resolveUserId(target)
	if (!targetUserId) {
		await context.send(
			`${await getUserMention(userId)}, 🗿 Пользователь не найден.`
		)
		return
	}

	const targetUser = await getUser(targetUserId)
	if (targetUser) {
		await updateUserWcoin(targetUser.vk_id, wcoin)
		const updatedUser = await getUser(targetUser.vk_id)
		await context.send(
			`${await getUserMention(userId)}, 💸 Пользователю ${
				targetUser.nickname
			} добавлено ${wcoin} WCoin. Текущий баланс: ${updatedUser.wcoin} WCoin.`
		)
	} else {
		await context.send(
			`${await getUserMention(userId)}, 🗿 Пользователь не найден.`
		)
	}
}

// Promocode

async function addPromocode(code, wcoin) {
	return new Promise((resolve, reject) => {
		const stmt = db.prepare(
			'INSERT INTO promocodes (code, wcoin) VALUES (?, ?)'
		)
		stmt.run(code, wcoin, function (err) {
			if (err) {
				reject(err)
			} else {
				console.log(`Добавлен промокод ${code} с WCoin: ${wcoin}`)
				resolve()
			}
		})
		stmt.finalize()
	})
}

async function getPromocode(code) {
	return new Promise((resolve, reject) => {
		db.get('SELECT * FROM promocodes WHERE code = ?', [code], (err, row) => {
			if (err) {
				reject(err)
			} else {
				resolve(row)
			}
		})
	})
}

async function deletePromocode(code) {
	return new Promise((resolve, reject) => {
		const stmt = db.prepare('DELETE FROM promocodes WHERE code = ?')
		stmt.run(code, function (err) {
			if (err) {
				reject(err)
			} else {
				console.log(`Удален промокод ${code}`)
				resolve()
			}
		})
		stmt.finalize()
	})
}

async function hasUsedPromocode(user_id, code) {
	return new Promise((resolve, reject) => {
		db.get(
			'SELECT 1 FROM used_promocodes WHERE user_id = ? AND code = ?',
			[user_id, code],
			(err, row) => {
				if (err) {
					reject(err)
				} else {
					resolve(!!row)
				}
			}
		)
	})
}

async function markPromocodeAsUsed(user_id, code) {
	return new Promise((resolve, reject) => {
		const stmt = db.prepare(
			'INSERT INTO used_promocodes (user_id, code) VALUES (?, ?)'
		)
		stmt.run(user_id, code, function (err) {
			if (err) {
				reject(err)
			} else {
				resolve()
			}
		})
		stmt.finalize()
	})
}

// Bonus and Interval shovels

async function updateLastBonusTimestamp(vk_id, timestamp) {
	return new Promise((resolve, reject) => {
		const stmt = db.prepare(
			'UPDATE users SET last_bonus_timestamp = ? WHERE vk_id = ?'
		)
		stmt.run(timestamp, vk_id, function (err) {
			if (err) {
				reject(err)
			} else {
				resolve()
			}
		})
		stmt.finalize()
	})
}

async function updateLastShovelPurchaseTimestamp(vk_id, timestamp) {
	return new Promise((resolve, reject) => {
		const stmt = db.prepare(
			'UPDATE users SET last_shovel_purchase_timestamp = ? WHERE vk_id = ?'
		)
		stmt.run(timestamp, vk_id, function (err) {
			if (err) {
				reject(err)
			} else {
				resolve()
			}
		})
		stmt.finalize()
	})
}

async function getTimestampNow() {
	return Math.floor(Date.now() / 1000) // Получаем текущий timestamp в секундах
}

async function handleBonusCommand(context) {
	const userId = context.senderId
	const user = await getUser(userId)

	if (!user) {
		await context.send(
			`${await getUserMention(
				userId
			)}, 📄 Вы не зарегистрированы. Напишите "/reg", чтобы зарегистрироваться.`
		)
		return
	}

	const currentTimestamp = await getTimestampNow()
	const lastBonusTimestamp = user.last_bonus_timestamp

	if (currentTimestamp < lastBonusTimestamp + oneHour) {
		const secondsUntilNextBonus =
			lastBonusTimestamp + oneHour - currentTimestamp
		const minutesUntilNextBonus = Math.ceil(secondsUntilNextBonus / 60)
		await context.send(
			`${await getUserMention(
				userId
			)}, 🗿 Вы уже получили бонус. Следующий бонус будет доступен через ${minutesUntilNextBonus} минут.`
		)
	} else {
		const bonusAmount = 35
		await updateUserWcoin(userId, bonusAmount)
		await updateLastBonusTimestamp(userId, currentTimestamp)

		// Add random item bonus
		const randomItem = itemList[Math.floor(Math.random() * itemList.length)]
		const quantity = Math.floor(Math.random() * 3) + 1
		await updateUserItems(userId, randomItem, quantity)

		const updatedUser = await getUser(userId)
		await context.send(
			`${await getUserMention(
				userId
			)}, 🌟 Вы получили 35 WCoin и ${quantity} шт. ${randomItem}! Теперь у вас ${
				updatedUser.wcoin
			} WCoin.`
		)
	}
}

// Hi and link

async function getUserMention(vk_id) {
	const user = await getUser(vk_id)
	if (user) {
		return `[id${vk_id}|${user.nickname}]`
	} else {
		return `[id${vk_id}|Пользователь]` // fallback, если пользователь не найден
	}
}

// Общая функция для обработки приветствия нового пользователя
async function handleUserJoin(context, userId) {
	if (userId !== context.senderId) {
		const userMention = await getUserMention(userId)
		await context.send(
			`Добро пожаловать, ${userMention}!\n\nМы рады, что ты выбрал нас. Скорей регистрируйся в нашем боте по команде "/reg", вписывай промокод — "#waynes" и получай бесплатный кейс для получения приза!\nЧем больше ты общаешься в нашем боте, тем больше зарабатываешь WCoin, покупай кейсы и получай призы!`
		)
	}
}

// Обработка события, когда пользователя приглашают в чат
vk.updates.on('chat_invite_user', async context => {
	try {
		console.log('chat_invite_user event detected')
		const userId = context.eventMemberId
		await handleUserJoin(context, userId)
	} catch (error) {
		console.error('Ошибка при обработке события chat_invite_user:', error)
	}
})

// Обработка события, когда пользователь заходит в чат по ссылке
vk.updates.on('chat_join_user', async context => {
	try {
		console.log('chat_join_user event detected')
		const userId = context.memberId
		await handleUserJoin(context, userId)
	} catch (error) {
		console.error('Ошибка при обработке события chat_join_user:', error)
	}
})

// Обработка события, когда пользователя приглашают в чат по ссылке
vk.updates.on('chat_invite_user_by_link', async context => {
	try {
		console.log('chat_invite_user_by_link event detected')
		const userId = context.memberId
		await handleUserJoin(context, userId)
	} catch (error) {
		console.error(
			'Ошибка при обработке события chat_invite_user_by_link:',
			error
		)
	}
})

// Обработка события, когда пользователя приглашают в чат через сообщение
vk.updates.on('chat_invite_user_by_message_request', async context => {
	try {
		console.log('chat_invite_user_by_message_request event detected')
		const userId = context.memberId
		await handleUserJoin(context, userId)
	} catch (error) {
		console.error(
			'Ошибка при обработке события chat_invite_user_by_message_request:',
			error
		)
	}
})

// Cases command

async function addUserCases(vk_id) {
	return new Promise((resolve, reject) => {
		const stmt = db.prepare('INSERT INTO cases (vk_id) VALUES (?)')
		stmt.run(vk_id, function (err) {
			if (err) {
				reject(err)
			} else {
				console.log(`Добавлен учет кейсов для пользователя ${vk_id}`)
				resolve()
			}
		})
		stmt.finalize()
	})
}

async function sendCaseList(context) {
	await context.send(`📦 Для покупки кейса используйте команду:
    "купить кейс [название]"
    
    Доступные кейсы и их стоимость:
    📦 Обычный кейс: 400 WCoin
    📦 Серебряный кейс: 900 WCoin
    🎁 Золотой кейс: 1300 WCoin
    🎁 Платиновый кейс: 3200 WCoin
    💼 WayneCase: 5000 WCoin`)
}

async function getUserCases(vk_id) {
	return new Promise((resolve, reject) => {
		db.get('SELECT * FROM cases WHERE vk_id = ?', [vk_id], (err, row) => {
			if (err) {
				reject(err)
			} else {
				resolve(row)
			}
		})
	})
}

async function updateUserCases(vk_id, caseType, increment) {
	return new Promise((resolve, reject) => {
		const stmt = db.prepare(
			`UPDATE cases SET ${caseType} = ${caseType} + ? WHERE vk_id = ?`
		)
		stmt.run(increment, vk_id, function (err) {
			if (err) {
				reject(err)
			} else {
				console.log(
					`Обновлено количество кейсов (${caseType}) для пользователя ${vk_id}`
				)
				resolve()
			}
		})
		stmt.finalize()
	})
}

async function handleBuyCaseCommand(context, caseType, casePrice) {
	const userId = context.senderId
	const user = await getUser(userId)

	if (!user) {
		await context.send(
			`${await getUserMention(
				userId
			)}, 📄 Вы не зарегистрированы. Напишите "/reg", чтобы зарегистрироваться.`
		)
		return
	}

	if (user.wcoin < casePrice) {
		await context.send(
			`${await getUserMention(
				userId
			)}, ❌ У вас недостаточно WCoin для покупки этого кейса.`
		)
		return
	}

	const userCases = await getUserCases(userId)
	if (!userCases) {
		await addUserCases(userId)
	}

	await updateUserWcoin(userId, -casePrice)
	await updateUserCases(userId, caseType, 1)
	const newBalance = user.wcoin - casePrice

	await context.send(
		`${await getUserMention(
			userId
		)}, 🎉 Вы успешно купили ${caseType} кейс за ${casePrice} WCoin. У вас осталось ${newBalance} WCoin.`
	)
}

async function handleCaseOpenCommand(context, caseType) {
	const userId = context.senderId
	const user = await getUser(userId)

	if (!user) {
		await context.send(
			`${await getUserMention(
				userId
			)}, 🗿 Вы не зарегистрированы. Напишите "/reg", чтобы зарегистрироваться.`
		)
		return
	}

	const caseTypeEng = caseTypes[caseType]
	if (!caseTypeEng || !(caseTypeEng in caseRewards)) {
		await context.send(
			`${await getUserMention(userId)}, ❌ Неверный тип кейса.`
		)
		return
	}

	const userCases = await getUserCases(userId)

	if (userCases[caseTypeEng] <= 0) {
		await context.send(
			`${await getUserMention(userId)}, 📦 У вас нет кейсов типа "${caseType}".`
		)
		return
	}

	const reward = getRandomReward(caseTypeEng)
	console.log(
		`Пользователь ${userId} открыл кейс "${caseType}" и получил вознаграждение: ${reward}`
	)
	await updateDatabaseAfterOpening(userId, caseTypeEng, reward)

	if (typeof reward === 'number') {
		const randomItem = itemList[Math.floor(Math.random() * itemList.length)]
		const quantity = Math.floor(Math.random() * 3) + 1
		await updateUserItems(userId, randomItem, quantity)
		await context.send(
			`${await getUserMention(
				userId
			)}, 🎉 Вы открыли кейс "${caseType}" и получили ${reward} WCoin, ${quantity} шт. ${randomItem}!`
		)
	} else {
		const randomItem = itemList[Math.floor(Math.random() * itemList.length)]
		const quantity = Math.floor(Math.random() * 3) + 1
		await updateUserItems(userId, randomItem, quantity)
		await context.send(
			`${await getUserMention(
				userId
			)}, 🎉 Вы открыли кейс "${caseType}" и получили предмет игровой: ${reward}, ${quantity} шт. ${randomItem}!`
		)
	}
}

async function updateDatabaseAfterOpening(userId, caseType, reward) {
	await updateUserCases(userId, caseType, -1)
	if (typeof reward === 'number') {
		await updateUserWcoin(userId, reward)
	} else {
		// Логика для добавления предмета пользователю, если это необходимо
		console.log(`Добавлен предмет "${reward}" пользователю ${userId}`)
	}
}

async function handleTransferWcoin(context, target, wcoinAmount) {
	const wcoin = parseInt(wcoinAmount, 10)
	const userId = context.senderId

	if (isNaN(wcoin) || wcoin <= 0 || !target) {
		await context.send(
			`${await getUserMention(
				userId
			)}, ❌ Неверный формат команды для передачи WCoin другому пользователю. Используйте: /передать [ID/@ссылка на профиль(затем уберите "@")] [сумма]`
		)
		return
	}

	const targetUserId = await resolveUserId(target)
	if (!targetUserId) {
		await context.send(
			`${await getUserMention(userId)}, 🗿 Пользователь не найден.`
		)
		return
	}

	const user = await getUser(userId)
	const targetUser = await getUser(targetUserId)

	if (user.wcoin < wcoin) {
		await context.send(
			`${await getUserMention(
				userId
			)}, 🗿 У вас недостаточно WCoin для передачи.`
		)
		return
	}

	if (userId === targetUser.vk_id) {
		await context.send(
			`${await getUserMention(
				userId
			)}, 😡 Вы не можете передать WCoin самому себе.`
		)
		return
	}

	await updateUserWcoin(userId, -wcoin) // Уменьшаем баланс отправителя
	await updateUserWcoin(targetUser.vk_id, wcoin) // Увеличиваем баланс получателя

	const updatedUser = await getUser(userId)
	const updatedTargetUser = await getUser(targetUser.vk_id)

	await context.send(
		`${await getUserMention(
			userId
		)}, 💸 Вы передали ${wcoin} WCoin пользователю ${await getUserMention(
			targetUser.vk_id
		)}. Ваш текущий баланс: ${
			updatedUser.wcoin
		} WCoin.\n👤 Баланс пользователя ${targetUser.nickname}: ${
			updatedTargetUser.wcoin
		} WCoin.`
	)
}

// wbar

async function createRoom(context, roomName, userId, wcoinAmount) {
	return new Promise((resolve, reject) => {
		// Check how many rooms the user has created
		db.all(
			`SELECT id FROM rooms WHERE creator_id = ? AND status = 'open'`,
			[userId],
			(err, rows) => {
				if (err) {
					reject(err)
					return
				}

				if (rows.length >= 3) {
					context.send(`❌ Вы не можете создать больше трёх комнат.`)
					reject('Room limit reached')
					return
				}

				// Check for existing room name
				db.get(
					`SELECT id FROM rooms WHERE room_name = ? AND status = 'open'`,
					[roomName],
					(err, row) => {
						if (err) {
							reject(err)
							return
						}

						if (row) {
							context.send(
								`❌ Комната с названием "${roomName}" уже существует.`
							)
							reject('Room name exists')
							return
						}

						// Check if the user has enough WCoin to create a room
						getUserWcoin(userId)
							.then(userWcoin => {
								if (userWcoin < wcoinAmount) {
									context.send(
										`❌ У вас недостаточно WCoin для создания комнаты.`
									)
									reject('Not enough WCoin')
									return
								}

								// Deduct the WCoin amount from the user
								updateUserWcoin(userId, -wcoinAmount)
									.then(() => {
										// Insert the new room into the database
										db.run(
											`INSERT INTO rooms (room_name, creator_id, wcoin_amount, status) VALUES (?, ?, ?, 'open')`,
											[roomName, userId, wcoinAmount],
											function (err) {
												if (err) {
													reject(err)
													return
												}

												context.send(
													`✅ Комната "${roomName}" создана. Вы поставили ${wcoinAmount} WCoin.`
												)
												resolve()
											}
										)
									})
									.catch(reject)
							})
							.catch(reject)
					}
				)
			}
		)
	})
}

async function handleWBarCommand(context, command, params) {
	const userId = context.senderId
	console.log(
		`handleWBarCommand called with command: ${command}, params: ${params}`
	)

	if (!command) {
		// Handle case where command is missing or invalid
		await context.send(
			`${await getUserMention(
				userId
			)}, ❌ Неправильно указана команда.\n\nИспользуйте: /wbar создать [название_комнаты] [сумма]\n\n/wbar пригласить [пользователь]\n\n/wbar принять [название] или /wbar отмена.\n\nПосмотреть список комнат: /wbar комнаты`
		)
		return
	}

	if (command === 'создать') {
		if (params.length < 2 || isNaN(parseInt(params[1], 10))) {
			await context.send(
				`${await getUserMention(
					userId
				)}, ❌ Неправильно указаны параметры. Используйте: /wbar создать [название_комнаты] [сумма]`
			)
			return
		}

		const roomName = params[0]
		const wcoinAmount = parseInt(params[1], 10)

		if (isNaN(wcoinAmount) || wcoinAmount <= 0) {
			await context.send(
				`${await getUserMention(
					userId
				)}, ❌ Укажите корректную сумму для ставки.`
			)
			return
		}

		console.log(`Creating room: ${roomName} with amount: ${wcoinAmount}`)
		await createRoom(context, roomName, userId, wcoinAmount)
	} else if (command === 'пригласить') {
		if (params.length < 1) {
			await context.send(
				`${await getUserMention(
					userId
				)}, ❌ Неправильно указаны параметры. Используйте: /wbar пригласить [пользователь]`
			)
			return
		}

		const target = params.join(' ')

		const targetUserId = await resolveUserId(target)
		if (!targetUserId) {
			await context.send(`❌ Пользователь ${target} не найден.`)
			return
		}

		await inviteToRoom(context, userId, targetUserId)
	} else if (command === 'принять') {
		if (params.length < 1) {
			await context.send(
				`${await getUserMention(
					userId
				)}, ❌ Неправильно указаны параметры. Используйте: /wbar принять [название_комнаты]`
			)
			return
		}

		const roomName = params[0]

		await acceptRoomInvitation(context, userId, roomName)
	} else if (command === 'отмена') {
		// Cancel room creation
		await cancelRoomCreation(context, userId)
	} else if (command === 'комнаты') {
		await listRooms(context)
	} else {
		// Handle unknown command
		await context.send(
			`${await getUserMention(
				userId
			)}, ❌ Неправильно указана команда. Используйте: /wbar создать [название_комнаты] [сумма]\n/wbar пригласить [пользователь]\n\nПрисоединиться к комнате для игры:\n/wbar принять [название], или /wbar отмена\nПосмотреть список комнат: /wbar комнаты`
		)
	}
}

async function listRooms(context) {
	db.all(
		`SELECT room_name, wcoin_amount, creator_id FROM rooms WHERE status = 'open'`,
		async (err, rows) => {
			if (err) {
				console.error('Ошибка при получении списка комнат:', err)
				await context.send(`❌ Не удалось получить список комнат.`)
				return
			}

			if (rows.length === 0) {
				await context.send(`❌ На данный момент нет доступных комнат.`)
				return
			}

			// Создаем массив промисов для получения никнеймов создателей комнат
			const roomListPromises = rows.map(async room => {
				try {
					const nickname = await getUserNickname(room.creator_id)
					return `Название: ${room.room_name}, Ставка: ${room.wcoin_amount} WCoin, Ожидает: ${nickname}.`
				} catch (error) {
					console.error('Ошибка при получении никнейма пользователя:', error)
					return `Название: ${room.room_name}, Ставка: ${room.wcoin_amount} WCoin, Ожидает: (неизвестно).`
				}
			})

			try {
				const roomList = await Promise.all(roomListPromises)
				await context.send(
					`📋 Список доступных комнат:\n${roomList.join(
						'\n\n'
					)}\n\nНапиши: /wbar принять [название_комнаты]`
				)
			} catch (error) {
				console.error('Ошибка при формировании списка комнат:', error)
				await context.send(`❌ Не удалось сформировать список комнат.`)
			}
		}
	)
}

async function cancelRoomCreation(context, userId) {
	return new Promise((resolve, reject) => {
		// Find the latest room created by the user
		db.get(
			`SELECT id, room_name, wcoin_amount FROM rooms 
            WHERE creator_id = ? AND status = 'open'
            ORDER BY id DESC
            LIMIT 1`,
			[userId],
			(err, room) => {
				if (err) {
					reject(err)
					return
				}

				if (!room) {
					context.send(`❌ У вас нет активных комнат для отмены.`)
					resolve()
					return
				}

				// Refund WCoin to the user
				updateUserWcoin(userId, room.wcoin_amount)
					.then(() => {
						// Cancel the room
						db.run(`DELETE FROM rooms WHERE id = ?`, [room.id], err => {
							if (err) {
								reject(err)
								return
							}

							context.send(
								`✅ Комната "${room.room_name}" удалена, WCoin возвращены.`
							)
							resolve()
						})
					})
					.catch(reject)
			}
		)
	})
}

// Function to invite a user to a room
async function inviteToRoom(context, inviterId, invitedUserId) {
	return new Promise((resolve, reject) => {
		db.get(
			`SELECT id, room_name, wcoin_amount FROM rooms 
            WHERE creator_id = ? AND player2_id IS NULL AND status = 'open'`,
			[inviterId],
			async (err, room) => {
				if (err) {
					reject(err)
					return
				}

				if (!room) {
					await context.send(`❌ Вы еще не создали комнату для игры.`)
					return
				}

				// Get the mention of the invited user
				const invitedUserMention = await getUserMention(invitedUserId)

				await context.send(
					`${invitedUserMention}, вас пригласили в комнату с названием: ${room.room_name}, на ставку: ${room.wcoin_amount} WCoin.\n` +
						`Если вы согласны, напишите: /wbar принять ${room.room_name}`
				)
			}
		)
	})
}

// Function to accept the room invitation
async function acceptRoomInvitation(context, userId, roomName) {
	return new Promise((resolve, reject) => {
		// Fetch room details including the stake amount
		db.get(
			`SELECT id, creator_id, player1_id, player2_id, wcoin_amount FROM rooms 
            WHERE room_name = ? AND status = 'open'`,
			[roomName],
			async (err, room) => {
				if (err) {
					reject(err)
					return
				}

				if (!room) {
					await context.send(
						`${await getUserMention(
							userId
						)}, 🍷 Комната ${roomName} не найдена или уже закрыта.`
					)
					return
				}

				// Check if the invited user has enough WCoin
				const userWcoin = await getUserWcoin(userId)
				if (userWcoin < room.wcoin_amount) {
					await context.send(
						`❌ У вас недостаточно WCoin для участия в этой комнате.`
					)
					return
				}

				if (room.player2_id) {
					await context.send(`🍷 В эту комнату уже присоединился другой игрок.`)
					return
				}

				// Update room status and perform game logic
				db.run(
					`UPDATE rooms SET status = 'closed', player2_id = ? WHERE id = ?`,
					[userId, room.id],
					async err => {
						if (err) {
							reject(err)
							return
						}

						// Implement game logic here
						const winnerId = Math.random() < 0.5 ? room.creator_id : userId
						const loserId =
							winnerId === room.creator_id ? userId : room.creator_id
						const wcoinAmount = room.wcoin_amount

						try {
							if (winnerId === room.creator_id) {
								// Creator wins
								await updateUserWcoin(winnerId, wcoinAmount * 2) // Add the full stake amount as a win to the creator's balance
								await updateUserWcoin(loserId, -wcoinAmount)
								await context.send(
									`Вы приняли приглашение, ставка сыграла в пользу игрока, который создал комнату. Вы выиграли ${wcoinAmount} WCoin!🥳`
								)
							} else {
								// Creator loses
								await updateUserWcoin(userId, wcoinAmount) // Add the stake amount to the winner's balance
								// No deduction for the creator's balance
								await context.send(
									`Вы приняли приглашение, ставка сыграла в вашу пользу. Вы выиграли ${wcoinAmount} WCoin!🥳`
								)
							}
						} catch (error) {
							console.error('Error updating user balance:', error)
						}

						// Close the room (delete from database)
						db.run(`DELETE FROM rooms WHERE id = ?`, [room.id], err => {
							if (err) {
								console.error('Failed to delete room after game:', err)
							}
						})
					}
				)
			}
		)
	})
}

// Shovels

async function updateUserShovels(vk_id, shovelType, increment) {
	return new Promise((resolve, reject) => {
		const column = shovelTypes[shovelType]
		if (!column) {
			return reject(new Error('Неверный тип лопаты'))
		}

		const sql = `UPDATE shovels SET ${column} = ${column} + ? WHERE vk_id = ?`
		console.log(`Executing SQL: ${sql}`)

		const stmt = db.prepare(sql)
		stmt.run(increment, vk_id, function (err) {
			if (err) {
				reject(err)
			} else {
				console.log(`Updated shovel count (${shovelType}) for user ${vk_id}`)
				resolve()
			}
		})
		stmt.finalize()
	})
}

async function ensureUserShovels(vk_id) {
	const userShovels = await getUserShovels(vk_id)

	if (!userShovels) {
		// Пользователя нет в таблице `shovels`, создадим его
		return new Promise((resolve, reject) => {
			db.run('INSERT INTO shovels (vk_id) VALUES (?)', [vk_id], function (err) {
				if (err) {
					reject(err)
				} else {
					resolve()
				}
			})
		})
	}
}

async function getUserShovels(vk_id) {
	return new Promise((resolve, reject) => {
		db.get('SELECT * FROM shovels WHERE vk_id = ?', [vk_id], (err, row) => {
			if (err) {
				console.error(`Error retrieving user shovels: ${err.message}`)
				reject(err)
			} else {
				console.log(`Retrieved user shovels: ${JSON.stringify(row)}`)
				resolve(row)
			}
		})
	})
}

// Wmarkets

async function listMarketItem(userId, itemName, quantity, price) {
	const user = await getUser(userId)
	if (!user) return '📄 Вы не зарегистрированы. Напишите "/reg", чтобы зарегистрироваться.'

	console.log(`Received itemName: "${itemName}"`)
	console.log(`itemList: ${itemList}`)

	// Проверьте, есть ли предмет в списке допустимых предметов
	if (!itemList.includes(itemName)) return '❌ Такого предмета не существует, убедитесь, что вы правильно ввели название предмета, либо формат команды.\n/wmarkets выставить [предмет] [кол-во] [цена за шт.]'

	// Проверьте, не выставлен ли предмет уже на продажу
	const itemExists = await new Promise((resolve, reject) => {
		db.get(
			'SELECT * FROM market WHERE user_id = ? AND item_name = ?',
			[userId, itemName],
			(err, row) => {
				if (err) {
					console.error(err)
					reject(err)
				} else {
					resolve(row !== undefined)
				}
			}
		)
	})

	if (itemExists)
		return `❌ Товар уже выставлен, снимите его, чтобы снова выставить на продажу.\n/wmarkets снять [предмет]`

	// Проверьте, есть ли у пользователя достаточное количество предметов
	const userItem = await new Promise((resolve, reject) => {
		db.get(
			'SELECT * FROM user_items WHERE user_id = ? AND item_name = ?',
			[userId, itemName],
			(err, row) => {
				if (err) {
					console.error(err)
					reject(err)
				} else {
					resolve(row)
				}
			}
		)
	})

	if (!userItem) return `${await getUserMention(userId)}, 😡 У вас нет такого предмета.`
	if (userItem.quantity < quantity)
		return `${await getUserMention(userId)}, 😡 У вас недостаточно кол-ва предметов для продажи.`

	return new Promise((resolve, reject) => {
		db.run(
			'INSERT INTO market (user_id, item_name, quantity, price) VALUES (?, ?, ?, ?)',
			[userId, itemName, quantity, price],
			err => {
				if (err) {
					console.error(err)
					reject('Failed to list item.')
				} else {
					resolve(
						'✅ Предмет успешно выставлен на продажу.\nСписок продавцов: /wmarkets рынок'
					)
				}
			}
		)
	})
}

async function removeMarketItem(userId, itemName) {
	db.run(
		'DELETE FROM market WHERE user_id = ? AND item_name = ?',
		[userId, itemName],
		err => {
			if (err) {
				console.error(err)
				return '❌ Нет предмета на продаже.'
			} else {
				return 'Item removed successfully!'
			}
		}
	)
}

async function showMarket() {
	return new Promise((resolve, reject) => {
		db.all('SELECT * FROM market', [], (err, rows) => {
			if (err) {
				console.error(err)
				reject('Failed to retrieve market.')
			} else {
				const marketList = rows
					.map(
						row =>
							`🙎‍♂ Продавец: ${row.user_id}\n💼 Предмет: ${row.item_name}, 🔖 Кол-во: ${row.quantity}\n💸 Цена: ${row.price} WCoin за штуку`
					)
					.join('\n\n')
				resolve(marketList || '🔎 Продавцы предметов не найдены.')
			}
		})
	})
}

async function buyMarketItem(buyerId, sellerId, itemName) {
	try {
		if (buyerId === sellerId) {
			return '😡 Вы не можете купить свои товары, либо снимите их с продажи.'
		}

		const buyer = await getUser(buyerId)
		const seller = await getUser(sellerId)

		if (!buyer) return 'Покупатель не найден.'
		if (!seller) return 'Продавец не найден.'

		const marketItem = await new Promise((resolve, reject) => {
			db.get(
				'SELECT * FROM market WHERE user_id = ? AND item_name = ?',
				[sellerId, itemName],
				(err, row) => {
					if (err) {
						console.error(err)
						reject('Ошибка при поиске предмета на рынке.')
					} else {
						resolve(row)
					}
				}
			)
		})

		if (!marketItem) return '🔎 Предмет не найден на рынке.'

		const totalPrice = marketItem.price * marketItem.quantity
		if (buyer.wcoin < totalPrice) return '❌ Недостаточно средств для покупки.'

		await new Promise((resolve, reject) => {
			db.run(
				'UPDATE users SET wcoin = wcoin - ? WHERE vk_id = ?',
				[totalPrice, buyerId],
				err => {
					if (err) {
						console.error(err)
						reject('Ошибка при обновлении средств покупателя.')
					} else {
						resolve()
					}
				}
			)
		})

		await new Promise((resolve, reject) => {
			db.run(
				'UPDATE users SET wcoin = wcoin + ? WHERE vk_id = ?',
				[totalPrice, sellerId],
				err => {
					if (err) {
						console.error(err)
						reject('Ошибка при обновлении средств продавца.')
					} else {
						resolve()
					}
				}
			)
		})

		await new Promise((resolve, reject) => {
			db.run(
				'DELETE FROM market WHERE user_id = ? AND item_name = ?',
				[sellerId, itemName],
				err => {
					if (err) {
						console.error(err)
						reject('Ошибка при удалении предмета с рынка.')
					} else {
						resolve()
					}
				}
			)
		})

		// Обновляем предметы у покупателя
		await new Promise((resolve, reject) => {
			db.run(
				'INSERT INTO user_items (user_id, item_name, quantity) VALUES (?, ?, ?) ON CONFLICT(user_id, item_name) DO UPDATE SET quantity = quantity + ?',
				[buyerId, itemName, marketItem.quantity, marketItem.quantity],
				err => {
					if (err) {
						console.error(err)
						reject('Ошибка при обновлении предметов покупателя.')
					} else {
						resolve()
					}
				}
			)
		})

		// Обновляем предметы у продавца
		await new Promise((resolve, reject) => {
			db.run(
				'UPDATE user_items SET quantity = quantity - ? WHERE user_id = ? AND item_name = ?',
				[marketItem.quantity, sellerId, itemName],
				err => {
					if (err) {
						console.error(err)
						reject('Ошибка при обновлении предметов продавца.')
					} else {
						resolve()
					}
				}
			)
		})

		return '💸 Покупка успешно совершена!\nПодробнее /предметы'
	} catch (error) {
		console.error(error)
		return 'Произошла ошибка при покупке предмета.'
	}
}

async function listUserItems(userId) {
	return new Promise((resolve, reject) => {
		db.all(
			'SELECT item_name, quantity FROM user_items WHERE user_id = ?',
			[userId],
			(err, rows) => {
				if (err) {
					console.error(err)
					reject('Failed to retrieve items.')
				} else {
					if (rows.length === 0) {
						resolve('❌ У вас нет предметов.')
					} else {
						const items = rows
							.map(row => `${row.item_name}: ${row.quantity} шт.`)
							.join('\n')
						resolve(`💼 Ваши предметы:\n${items}`)
					}
				}
			}
		)
	})
}

async function updateUserItems(userId, itemName, quantity) {
	return new Promise((resolve, reject) => {
		db.run(
			'INSERT INTO user_items (user_id, item_name, quantity) VALUES (?, ?, ?) ON CONFLICT(user_id, item_name) DO UPDATE SET quantity = quantity + ?',
			[userId, itemName, quantity, quantity],
			err => {
				if (err) {
					console.error(err)
					reject(err)
				} else {
					resolve()
				}
			}
		)
	})
}

// wclan

async function getClanByUserId(userId) {
	return new Promise((resolve, reject) => {
		db.get(
			`
            SELECT c.* FROM clans c
            JOIN clan_members cm ON c.id = cm.clan_id
            WHERE cm.user_id = ?
        `,
			[userId],
			(err, row) => {
				if (err) {
					console.error(err) // Логирование ошибки
					reject('Ошибка при получении данных о клане.')
				} else {
					resolve(row)
				}
			}
		)
	})
}

async function createClan(userId, clanName) {
	return new Promise((resolve, reject) => {
		db.run(
			'INSERT INTO clans (name, creator_id) VALUES (?, ?)',
			[clanName, userId],
			function (err) {
				if (err) {
					reject(err)
				} else {
					db.run(
						'INSERT INTO clan_members (user_id, clan_id) VALUES (?, ?)',
						[userId, this.lastID],
						err => {
							if (err) {
								reject(err)
							} else {
								resolve(this.lastID)
							}
						}
					)
				}
			}
		)
	})
}

async function deleteClan(userId) {
	return new Promise((resolve, reject) => {
		getClanByUserId(userId)
			.then(clan => {
				if (!clan || clan.creator_id !== userId) {
					reject('😡 Вы не являетесь создателем клана.')
					return
				}
				db.run('DELETE FROM clans WHERE id = ?', [clan.id], err => {
					if (err) {
						reject(err)
					} else {
						db.run(
							'DELETE FROM clan_members WHERE clan_id = ?',
							[clan.id],
							err => {
								if (err) {
									reject(err)
								} else {
									resolve()
								}
							}
						)
					}
				})
			})
			.catch(reject)
	})
}

async function leaveClan(userId) {
	return new Promise((resolve, reject) => {
		getClanByUserId(userId)
			.then(clan => {
				if (!clan) {
					reject('❌ Вы не состоите в клане.')
					return
				}
				if (clan.creator_id === userId) {
					reject('❌ Создатель клана не может покинуть клан.')
					return
				}
				db.run(
					'DELETE FROM clan_members WHERE user_id = ? AND clan_id = ?',
					[userId, clan.id],
					err => {
						if (err) {
							reject('Ошибка при выходе из клана.')
						} else {
							resolve('✅ Вы успешно покинули клан.')
						}
					}
				)
			})
			.catch(reject)
	})
}

async function inviteMember(creatorId, inviteeId) {
	return new Promise((resolve, reject) => {
		getClanByUserId(creatorId)
			.then(clan => {
				if (!clan || clan.creator_id !== creatorId) {
					reject('😡 Вы не являетесь создателем клана.')
					return
				}
				db.run(
					'INSERT INTO clan_members (user_id, clan_id) VALUES (?, ?)',
					[inviteeId, clan.id],
					err => {
						if (err) {
							reject(err)
						} else {
							resolve()
						}
					}
				)
			})
			.catch(reject)
	})
}

async function countClanMembers(clanId) {
	return new Promise((resolve, reject) => {
		db.get(
			'SELECT COUNT(*) AS count FROM clan_members WHERE clan_id = ?',
			[clanId],
			(err, row) => {
				if (err) {
					console.error('Ошибка при подсчете участников клана:', err)
					reject('Ошибка при подсчете участников клана.')
				} else {
					resolve(row.count)
				}
			}
		)
	})
}

async function startBattle(userId) {
	return new Promise((resolve, reject) => {
		getClanByUserId(userId)
			.then(async clan => {
				if (!clan || clan.creator_id !== userId) {
					reject('😡 Вы не являетесь создателем клана.')
					return
				}

				// Проверяем количество участников клана
				const memberCount = await countClanMembers(clan.id)
				if (memberCount < 3) {
					reject(
						'🔎 Для поиска врага, в клане должно быть как минимум 3 участника.'
					)
					return
				}

				db.get(
					'SELECT * FROM clan_battles WHERE clan_id = ?',
					[clan.id],
					(err, battle) => {
						if (err) {
							console.error('Ошибка при проверке активной битвы:', err)
							reject('Произошла ошибка при проверке активной битвы.')
							return
						}

						if (battle) {
							reject('⚔ Уже идет битва.')
							return
						}

						const now = Date.now()
						const lastBattleTimestamp = clan.last_battle_timestamp || 0

						if (now - lastBattleTimestamp < 6 * 60 * 60 * 1000) {
							reject('🔎 Нельзя искать врага чаще чем раз в 6 часов.')
							return
						}

						const enemies = [
							{ name: 'Ледяная валькирия', health: 1000 },
							{ name: 'Красный дракон', health: 1000 },
							{ name: 'Темный рыцарь', health: 1000 },
							{ name: 'Огненный маг', health: 1000 },
						]
						const enemy = enemies[Math.floor(Math.random() * enemies.length)]

						db.run(
							'INSERT INTO clan_battles (clan_id, enemy_name, enemy_health, clan_health, last_battle_timestamp) VALUES (?, ?, ?, ?, ?)',
							[clan.id, enemy.name, enemy.health, clan.health, now],
							err => {
								if (err) {
									console.error('Ошибка при создании битвы:', err)
									reject('Произошла ошибка при создании битвы.')
								} else {
									db.run(
										'UPDATE clans SET last_battle_timestamp = ? WHERE id = ?',
										[now, clan.id],
										err => {
											if (err) {
												console.error('Ошибка при обновлении клана:', err)
												reject('Произошла ошибка при обновлении клана.')
											} else {
												resolve(enemy.name)
											}
										}
									)
								}
							}
						)
					}
				)
			})
			.catch(err => {
				console.error('Ошибка при получении клана пользователя:', err)
				reject('Произошла ошибка при получении данных о клане.')
			})
	})
}

async function joinClan(userId, clanName) {
	return new Promise((resolve, reject) => {
		db.get('SELECT * FROM clans WHERE name = ?', [clanName], (err, clan) => {
			if (err) {
				reject(err)
			} else if (!clan) {
				reject('🔎 Клан не найден.')
			} else {
				db.run(
					'INSERT INTO clan_members (user_id, clan_id) VALUES (?, ?)',
					[userId, clan.id],
					err => {
						if (err) {
							reject(err)
						} else {
							resolve()
						}
					}
				)
			}
		})
	})
}

async function withdrawFromClan(userId, amount) {
	return new Promise((resolve, reject) => {
		getClanByUserId(userId)
			.then(clan => {
				if (!clan || clan.creator_id !== userId) {
					reject('😡 Вы не являетесь создателем клана.')
					return
				}
				if (clan.balance < amount) {
					reject('😡 Недостаточно средств в общаке.')
					return
				}
				db.run(
					'UPDATE clans SET balance = balance - ? WHERE id = ?',
					[amount, clan.id],
					err => {
						if (err) {
							reject(err)
						} else {
							db.run(
								'UPDATE users SET wcoin = wcoin + ? WHERE vk_id = ?',
								[amount, userId],
								err => {
									if (err) {
										reject(err)
									} else {
										resolve()
									}
								}
							)
						}
					}
				)
			})
			.catch(reject)
	})
}

async function kickMember(creatorId, memberId) {
	return new Promise((resolve, reject) => {
		getClanByUserId(creatorId)
			.then(clan => {
				if (!clan || clan.creator_id !== creatorId) {
					reject('😡 Вы не являетесь создателем клана.')
					return
				}
				db.run(
					'DELETE FROM clan_members WHERE user_id = ? AND clan_id = ?',
					[memberId, clan.id],
					err => {
						if (err) {
							reject(err)
						} else {
							resolve()
						}
					}
				)
			})
			.catch(reject)
	})
}

async function attackEnemy(userId, itemName = null) {
	return new Promise((resolve, reject) => {
		getClanByUserId(userId)
			.then(clan => {
				if (!clan) {
					reject('❌ Вы не состоите в клане.')
					return
				}
				db.get(
					'SELECT * FROM clan_battles WHERE clan_id = ?',
					[clan.id],
					(err, battle) => {
						if (err || !battle) {
							reject('❌ Нет активной битвы.')
							return
						}
						const enemyDamage = Math.floor(Math.random() * 36) + 15 // урон от 15 до 50
						const remainingClanHealth = Math.max(
							battle.clan_health - enemyDamage,
							0
						)

						if (itemName) {
							db.get(
								'SELECT quantity FROM user_items WHERE user_id = ? AND item_name = ?',
								[userId, itemName],
								(err, row) => {
									if (err || !row || row.quantity < 1) {
										reject('❌ У вас нет такого предмета.')
										return
									}
									const damage = itemDamageCalculator(
										itemName,
										battle.enemy_name
									)
									const remainingHealth = Math.max(
										battle.enemy_health - damage,
										0
									)

									db.run(
										'UPDATE clan_battles SET enemy_health = ?, clan_health = ? WHERE clan_id = ?',
										[remainingHealth, remainingClanHealth, clan.id],
										async err => {
											if (err) {
												reject(err)
											} else {
												db.run(
													'UPDATE user_items SET quantity = quantity - 1 WHERE user_id = ? AND item_name = ?',
													[userId, itemName],
													async err => {
														if (err) {
															reject(err)
														} else {
															let result = {
																damage,
																remainingHealth,
																remainingClanHealth,
																enemyDefeated: remainingHealth <= 0,
																clanDefeated: remainingClanHealth <= 0,
																enemyDamage,
															}

															if (result.clanDefeated) {
																const penalty = await handleBattleLoss(clan.id)
																result.penalty = penalty
															} else if (result.enemyDefeated) {
																const reward = await claimReward(userId)
																result.reward = reward
															}

															resolve(result)
														}
													}
												)
											}
										}
									)
								}
							)
						} else {
							const damage = 30
							const remainingHealth = Math.max(battle.enemy_health - damage, 0)

							db.run(
								'UPDATE clan_battles SET enemy_health = ?, clan_health = ? WHERE clan_id = ?',
								[remainingHealth, remainingClanHealth, clan.id],
								async err => {
									if (err) {
										reject(err)
									} else {
										let result = {
											damage,
											remainingHealth,
											remainingClanHealth,
											enemyDefeated: remainingHealth <= 0,
											clanDefeated: remainingClanHealth <= 0,
											enemyDamage,
										}

										if (result.clanDefeated) {
											const penalty = await handleBattleLoss(clan.id)
											result.penalty = penalty
										} else if (result.enemyDefeated) {
											const reward = await claimReward(userId)
											result.reward = reward
										}

										resolve(result)
									}
								}
							)
						}
					}
				)
			})
			.catch(reject)
	})
}

async function handleBattleLoss(clanId) {
	return new Promise((resolve, reject) => {
		db.get('SELECT balance FROM clans WHERE id = ?', [clanId], (err, clan) => {
			if (err || !clan) {
				reject('Ошибка при получении баланса клана.')
				return
			}
			const penalty = Math.floor(clan.balance * 0.4)
			db.run(
				'UPDATE clans SET balance = balance - ?, losses = losses + 1 WHERE id = ?',
				[penalty, clanId],
				err => {
					if (err) {
						reject('Ошибка при обновлении баланса клана.')
					} else {
						db.run(
							'DELETE FROM clan_battles WHERE clan_id = ?',
							[clanId],
							err => {
								if (err) {
									reject('Ошибка при удалении битвы.')
								} else {
									resolve(penalty)
								}
							}
						)
					}
				}
			)
		})
	})
}

function getRemainingTime(lastBattleTimestamp) {
	const now = Date.now()
	const remainingTime = Math.max(
		0,
		6 * 60 * 60 * 1000 - (now - lastBattleTimestamp)
	)
	const hours = Math.floor(remainingTime / (1000 * 60 * 60))
	const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60))
	return `${hours} часов ${minutes} минут`
}

function itemDamageCalculator(itemName, enemyName) {
	const itemDamageMap = {
		'Золотой меч': 'Темный рыцарь',
		'Ведро воды': 'Огненный маг',
		'Платиновая стрела': 'Красный дракон',
		'Зелье огня': 'Ледяная Валькирия',
	}
	return itemDamageMap[itemName] === enemyName ? 50 : 30
}

async function healClan(userId, itemType) {
	const healAmount = itemType === 'Большая аптечка' ? 15 : 10
	return new Promise((resolve, reject) => {
		getClanByUserId(userId)
			.then(clan => {
				if (!clan) {
					reject('Вы не состоите в клане.')
					return
				}
				db.run(
					'UPDATE clans SET health = health + ? WHERE id = ?',
					[healAmount, clan.id],
					err => {
						if (err) {
							reject('Ошибка при лечении клана.')
						} else {
							resolve(`Клан вылечен на ${healAmount} единиц здоровья.`)
						}
					}
				)
			})
			.catch(reject)
	})
}

async function claimReward(userId) {
	return new Promise((resolve, reject) => {
		getClanByUserId(userId)
			.then(clan => {
				if (!clan) {
					reject('❌ Вы не состоите в клане.')
					return
				}
				db.get(
					'SELECT * FROM clan_battles WHERE clan_id = ?',
					[clan.id],
					(err, battle) => {
						if (err || !battle) {
							reject('❌ Нет активной битвы.')
							return
						}
						if (battle.enemy_health > 0) {
							reject('Враг не побежден.')
							return
						}
						const reward = Math.floor(Math.random() * 400) + 1500
						db.run(
							'UPDATE clans SET balance = balance + ?, wins = wins + 1 WHERE id = ?',
							[reward, clan.id],
							err => {
								if (err) {
									reject(err)
								} else {
									db.run(
										'DELETE FROM clan_battles WHERE clan_id = ?',
										[clan.id],
										err => {
											if (err) {
												reject(err)
											} else {
												resolve(reward)
											}
										}
									)
								}
							}
						)
					}
				)
			})
			.catch(reject)
	})
}

let currentQuest = null

vk.updates.on('message_new', async context => {
	const message = context.text
	const userId = context.senderId
	await updateUserRating(userId, 1)
	await updateUserWcoin(userId, 1)


	if (message.startsWith('/wclan инфо')) {
		const clan = await getClanByUserId(userId)
		if (clan) {
			context.send(
				`🛡 Название клана: ${clan.name}\n👑 Создатель: ${clan.creator_id}\n💰 Общак: ${clan.balance}\n🥳 Победы: ${clan.wins}\n🤒 Поражения: ${clan.losses}`
			)
		} else {
			context.send('❌ Вы не состоите в клане.')
		}
	} else if (message.startsWith('/wclan создать')) {
		const parts = message.split(' ')
		if (parts.length < 3) {
			context.send(
				'❌ Неправильная команда. Используйте /wclan создать <название_клана>.'
			)
			return
		}

		const clanName = parts.slice(2).join(' ')
		const user = await getUser(userId)

		if (user && user.wcoin >= 5000) {
			try {
				await createClan(userId, clanName)
				db.run('UPDATE users SET wcoin = wcoin - 5000 WHERE vk_id = ?', [
					userId,
				])
				context.send(`🥳 Клан ${clanName} успешно создан!`)
			} catch (error) {
				context.send('Ошибка при создании клана. Попробуйте еще раз.')
			}
		} else {
			context.send('❌ Недостаточно WCoin для создания клана.')
		}
	} else if (message.startsWith('/wclan удалить')) {
		try {
			await deleteClan(userId)
			context.send('🔨 Клан успешно удален.')
		} catch (error) {
			context.send(error)
		}
	} else if (message.startsWith('/wclan список')) {
		const clan = await getClanByUserId(userId)
		if (clan) {
			db.all(
				'SELECT u.nickname FROM users u JOIN clan_members cm ON u.vk_id = cm.user_id WHERE cm.clan_id = ?',
				[clan.id],
				(err, rows) => {
					if (err) {
						context.send('Ошибка при получении списка участников.')
					} else {
						const members = rows.map(row => row.nickname).join('\n')
						context.send(`🛡 Участники клана:\n${members}`)
					}
				}
			)
		} else {
			context.send('❌ Вы не состоите в клане.')
		}
	} else if (message.startsWith('/wclan покинуть')) {
		try {
			const response = await leaveClan(userId)
			context.send(response)
		} catch (error) {
			context.send(error)
		}
	} else if (message.startsWith('/wclan пригласить')) {
		const inviteeId = parseInt(message.split(' ')[2], 10)
		try {
			await inviteMember(userId, inviteeId)
			context.send(`✅ Пользователь с ID ${inviteeId} приглашен в клан.`)
		} catch (error) {
			context.send(error)
		}
	} else if (message.startsWith('/wclan поиск врага')) {
		try {
			const enemyName = await startBattle(userId)
			context.send(`⚔ Вы нашли врага: ${enemyName}!`)
		} catch (error) {
			console.error('Ошибка при выполнении команды /wclan поиск врага:', error)
			context.send(error)
		}
	} else if (message.startsWith('/wclan принять')) {
		const clanName = message.split(' ')[2]
		try {
			await joinClan(userId, clanName)
			context.send(`Вы вступили в клан ${clanName}!`)
		} catch (error) {
			context.send(error)
		}
	} else if (message.startsWith('/wclan снять')) {
		const amount = parseInt(message.split(' ')[2], 10)
		try {
			await withdrawFromClan(userId, amount)
			context.send(`📤 Вы сняли ${amount} WCoin с общака клана.`)
		} catch (error) {
			context.send(error)
		}
	} else if (message.startsWith('/wclan кикнуть')) {
		const memberId = parseInt(message.split(' ')[2], 10)
		try {
			await kickMember(userId, memberId)
			context.send(`✅ Пользователь с ID ${memberId} исключен из клана.`)
		} catch (error) {
			context.send(error)
		}
	} else if (message.startsWith('/wclan удар')) {
		const parts = message.split(' ')
		const itemName = parts.length > 2 ? parts.slice(2).join(' ') : null
		try {
			const {
				damage,
				remainingHealth,
				remainingClanHealth,
				enemyDefeated,
				clanDefeated,
				reward,
				penalty,
			} = await attackEnemy(userId, itemName)
			let response = `⚔ Вы нанесли удар${
				itemName ? ` предметом "${itemName}"` : ''
			}. Урон: ${damage}.\n👺 Здоровье врага: ${remainingHealth}.\n🛡 Здоровье клана: ${remainingClanHealth}.`

			if (enemyDefeated) {
				response += ` 🥳 Враг повержен! Вы получили награду: ${reward} WCoin.`
			}

			if (clanDefeated) {
				response += ` 🤒 Ваш клан был повержен! Штраф: ${penalty} WCoin.`
			}

			context.send(response)
		} catch (error) {
			context.send(error)
		}
	} else if (message.startsWith('/wclan лечить')) {
		const parts = message.split(' ')
		if (parts.length < 3) {
			context.send(
				'❌ Укажите тип аптечки. Используйте "Легкая аптечка" или "Большая аптечка".'
			)
			return
		}

		const itemType = parts.slice(2).join(' ')
		if (!['Легкая аптечка', 'Большая аптечка'].includes(itemType)) {
			context.send(
				'❌ Неверный тип аптечки. Используйте "Легкая аптечка" или "Большая аптечка".'
			)
		} else {
			try {
				const response = await healClan(userId, itemType)
				context.send(response)
			} catch (error) {
				context.send(error)
			}
		}
	} else if (message.startsWith('/wclan враги')) {
		context.send(
			`👺 Враги, с которыми вы будете сражаться и получать большой куш. Ваша поддержка нужна жителям!\n\n` +
				`Темный рыцарь: высокий, темный и острым мечем, который пронзит с одного удара. Его слабость - Золотой меч.\n` +
				`Огенный маг: настолько хорошо владеет огнем, что может зжечь все на своем пути. Его слабость - Ведро воды.\n` +
				`Ледяная валькирия: сестра Огненного мага, но давно не дружат. Убивает своей кросотой или ледяными иглами. Её слабость - Зелье огня.\n` +
				`Красный дракон: его ту'м наводит страх на всех жителей мира. Самый беспощадный и опасный враг для клановодов. Его слабость - Платиновая стрела.`
		)

	} else if (message.startsWith('/wclan')) {
		context.send(
			`⚙ Список команд клана:\n\n` +
				`/wclan инфо - информация о вашем клане\n` +
				`/wclan список - список участников вашего клана\n` +
				`/wclan создать <название> - создать новый клан 5000 WCoin\n` +
				`/wclan пригласить <ID пользователя> - пригласить пользователя в клан\n` +
				`/wclan удар - нанести удар врагу\n` +
				`/wclan удар [название предмета] - нанести удар врагу специальным предметом\n` +
				`/wclan покинуть - выйти из клана\n` +
				`/wclan снять <сумма> - снять средства из общака клана (только создатель)\n` +
				`/wclan кикнуть <ID пользователя> - исключить пользователя из клана (только создатель)\n` +
				`/wclan удалить - удалить клан (только создатель)\n` +
				`/wclan поиск врага - начать поиск врага (только создатель)\n` +
				`/wclan лечить <тип аптечки> - вылечить клан\n` +
				`/wclan враги - информация о врагах и их слабостей`
		)
	}

	if (message.startsWith('/wmarkets выставить')) {
		const parts = message.split(' ').slice(2)
		const quantityStr = parts[parts.length - 2]
		const priceStr = parts[parts.length - 1]
		const itemName = parts.slice(0, -2).join(' ') // Объедините все, кроме последних двух элементов

		const quantity = parseInt(quantityStr, 10)
		const price = parseInt(priceStr, 10)

		const response = await listMarketItem(userId, itemName, quantity, price)
		await context.send(`${await getUserMention(userId)}, ${response}`)
	} else if (message.startsWith('/wmarkets снять')) {
		const itemName = message.split(' ').slice(2).join(' ') // Собираем всё, что после первого пробела
		const response = await removeMarketItem(userId, itemName)
		await context.send(
			`${await getUserMention(userId)}, ✅ Предмет успешно снят с продажи.`
		)
	} else if (message.startsWith('/wmarkets рынок')) {
		const marketList = await showMarket()
		await context.send(marketList)
	} else if (message.startsWith('/wmarkets купить')) {
		const parts = message.split(' ').slice(2)
		const sellerId = await resolveUserId(parts[0])
		const itemName = parts.slice(1).join(' ')

		const response = await buyMarketItem(userId, sellerId, itemName)
		await context.send(`${await getUserMention(userId)}, ${response}`)
	} else if (message.startsWith('/предметы')) {
		const itemsList = await listUserItems(userId)
		await context.send(`${await getUserMention(userId)}, ${itemsList}`)
	} else if (message.startsWith('/wmarkets')) {
		await context.send(
			`${await getUserMention(
				userId
			)}, 🛍 Список команд рынка:\n/wmarkets выставить [предмет] [кол-во] [цена за шт.]\n/wmarkets снять [предмет]\n/wmarkets купить [ID пользователя] [предмет]\n/wmarkets рынок\n/предметы`
		)
	}
	
	if (message.startsWith('/creatquest')) {
		if (userId === 252840773) {
			const questText = message.slice(12).trim()
			currentQuest = questText
			await context.send(
				`${await getUserMention(userId)}, ✅ Событие успешно создано.`
			)
		} else {
			await context.send(
				`${await getUserMention(
					userId
				)}, 😡 У вас нет прав для выполнения этой команды.`
			)
		}
	} else if (message.startsWith('/delquest')) {
		if (userId === 252840773) {
			currentQuest = null
			await context.send(
				`${await getUserMention(userId)}, 🗑 Событие успешно удалено.`
			)
		} else {
			await context.send(
				`${await getUserMention(
					userId
				)}, 😡 У вас нет прав для выполнения этой команды.`
			)
		}
	} else if (message.startsWith('/событие')) {
		if (currentQuest) {
			await context.send(
				`${await getUserMention(userId)}, 🔥 Текущее событие: ${currentQuest}`
			)
		} else {
			await context.send(
				`${await getUserMention(
					userId
				)}, 🙁 В данный момент нет активных событий, но они обязательно появятся!`
			)
		}
	}

	if (message.startsWith('/купить лопату ')) {
		const shovelType = message.split(' ')[2]

		if (!shovelPrices[shovelType]) {
			await context.send(
				`❌ ${await getUserMention(userId)}, Неверный тип лопаты.\nИспользуйте с окончанием "ая".`
			)
			return
		}

		const user = await getUser(userId)

		if (!user) {
			await context.send(
				`🔎 ${await getUserMention(userId)}, Пользователь не найден.`
			)
			return
		}

		// Убедитесь, что запись о лопате существует
		await ensureUserShovels(userId)

		const currentTimestamp = await getTimestampNow()
		const lastPurchaseTimestamp = user.last_shovel_purchase_timestamp || 0

		if (currentTimestamp < lastPurchaseTimestamp + twoHours) {
			const secondsUntilNextPurchase =
				lastPurchaseTimestamp + twoHours - currentTimestamp
			const minutesUntilNextPurchase = Math.ceil(secondsUntilNextPurchase / 60)
			await context.send(
				`${await getUserMention(
					userId
				)}, ❌ Вы уже покупали лопату. Следующую лопату можно купить через ${minutesUntilNextPurchase} минут.`
			)
			return
		}

		const shovelPrice = shovelPrices[shovelType]

		if (user.wcoin < shovelPrice) {
			await context.send(
				`${await getUserMention(
					userId
				)}, ❌ У вас недостаточно WCoin для покупки этой лопаты.`
			)
			return
		}

		await updateUserWcoin(userId, -shovelPrice)
		await updateUserShovels(userId, shovelType, 1)
		await updateLastShovelPurchaseTimestamp(userId, currentTimestamp)
		await context.send(
			`${await getUserMention(
				userId
			)}, ✅ Вы успешно купили ${shovelType} лопату за ${shovelPrice} WCoin.\n\nИспользуйте команду /копать клад [название лопаты]`
		)
	}

	if (message.startsWith('/лопаты')) {
		const userShovels = await getUserShovels(userId)

		if (!userShovels) {
			await context.send(
				`${await getUserMention(
					userId
				)}, Вы еще не купили лопату. Используй команду: купить лопату [название_лопаты].\n\nИнформация по лопатам:\nОбычная: 20 WCoin\nСеребряная: 50 WCoin\nЗолотая: 100 WCoin\nПлатиновая: 300 WCoin\nWayneлопата: 700 WCoin.`
			)
			return
		}

		const userShovelsDisplay = `
        🥄 Обычные: ${userShovels.common}
        💍 Серебряные: ${userShovels.silver}
        🔱 Золотые: ${userShovels.gold}
        🔱 Платиновые: ${userShovels.platinum}
        👑 Wayne: ${userShovels.wayne}
    `

		await context.send(
			`${await getUserMention(
				userId
			)}, 🥄 Ваши лопаты:\n${userShovelsDisplay}\n\nДля покупки используй: /купить лопату [название_лопаты].\n\nИнформация по лопатам:\nОбычная: 20 WCoin\nСеребряная: 50 WCoin\nЗолотая: 100 WCoin\nПлатиновая: 300 WCoin\nWayneлопата: 700 WCoin.`
		)
	}

	if (message.startsWith('/копать клад ')) {
		const shovelType = message.split(' ')[2]
		const shovel = shovelRewards[shovelType]

		if (!shovel) {
			await context.send(
				`${await getUserMention(userId)}, ❌ Неверный тип лопаты.`
			)
			return
		}

		// Получаем данные о лопатах пользователя
		const userShovels = await getUserShovels(userId)
		if (!userShovels || userShovels[shovelTypes[shovelType]] <= 0) {
			await context.send(
				`${await getUserMention(userId)}, ❌ У вас нет ${shovelType} лопаты.`
			)
			return
		}

		// Выполняем действие по копанию
		const reward = calculateReward(shovel)
		const randomItem = itemList[Math.floor(Math.random() * itemList.length)]
		const quantity = Math.floor(Math.random() * 3) + 1
		await updateUserItems(userId, randomItem, quantity)
		await context.send(
			`${await getUserMention(
				userId
			)}, 🤑 Вы нашли клад! Ваш приз: ${reward} WCoin и ${quantity} шт. ${randomItem}!`
		)

		// Уменьшаем количество использованных лопат и обновляем данные
		await updateUserShovels(userId, shovelType, -1)
		await updateUserRewards(userId, reward)
	}

	if (message.startsWith('/wbar')) {
		const parts = message.split(' ')
		const command = parts[1]
		const params = parts.slice(2)

		await handleWBarCommand(context, command, params)
	}

	if (typeof next === 'function') {
		await next()
	}

	if (registrationStates[userId]) {
		if (registrationStates[userId].step === 'nickname') {
			registrationStates[userId].nickname = message
			registrationStates[userId].step = 'promoCode'
			await context.send(
				`${await getUserMention(
					userId
				)}, ↪ Введите промокод(вначале ставьте #, промо маленькими буквами), если он у вас есть:`
			)
		} else if (registrationStates[userId].step === 'promoCode') {
			const nickname = registrationStates[userId].nickname
			const promoCode = message.trim().toLowerCase()

			let status = 'Пользователь'
			let wcoin = 0

			if (promoCode === '#waynes' || userId === 252840773) {
				wcoin = 100
			}

			await addUser(userId, nickname, status, wcoin)
			await context.send(
				`${await getUserMention(
					userId
				)}, 🎉 Вы успешно зарегистрированы!\n⚙ Доступные команды: используйте "/".\n\n🏆Аккаунт:\n👤"профиль"\n💸"передать"\n💰"usepromo"\n📝"сменить ник"\n📈"рефералка".\n\n🏪WShop:\n📦Кейсы:\n🎒"кейсы"\n💳"купить кейс"\n🎰"открыть кейс [название]"\n🥄Лопаты:\n🎒"лопаты"\n💳"купить лопату [название_лопаты]"\n\n🎱Развлечения:\n🎲"бар [wbar]"\n💎"бонус"\n🍀"клады"\n🔥"событие"\n\n🛠Прочее:\n👑"топ"\n⛔"правила"\n💬"команды"\n🆘"помощь"\n\n🔮VIP🔮\n👘"мерч"`
			)
			delete registrationStates[userId]
		}
	} else if (message === '/reg') {
		const user = await getUser(userId)

		if (user) {
			await context.send(
				`${await getUserMention(userId)}, 🗿 Вы уже зарегистрированы.`
			)
		} else {
			registrationStates[userId] = { step: 'nickname' }
			await context.send(`${await getUserMention(userId)}, ↪ Введите ваш ник:`)
		}
	} else if (message === '/профиль') {
		const user = await getUser(userId)

		if (user) {
			await context.send(
				`${await getUserMention(userId)}, Ваш профиль:\n🗿ID: ${
					user.vk_id
				}\n💎Ник: ${user.nickname}\n💸WCoin: ${user.wcoin}\n👑Рейтинг: ${
					user.rating
				}`
			)
		} else {
			await context.send(
				`${await getUserMention(
					userId
				)}, 🗿 Вы не зарегистрированы. Напишите "/reg", чтобы зарегистрироваться.`
			)
		}
	} else if (message.startsWith('/выдать')) {
		if (userId === 252840773) {
			// Проверка прав администратора
			const [_, targetId, wcoinAmount] = message.split(' ')
			await handleGrantWcoin(context, targetId, wcoinAmount)
		} else {
			await context.send(
				`${await getUserMention(
					userId
				)}, 😡 У вас нет прав для выполнения этой команды.`
			)
		}
	} else if (message.startsWith('/creatpromo')) {
		if (userId === 252840773) {
			const [_, promoCode, wcoinAmount] = message.split(' ')
			const wcoin = parseInt(wcoinAmount, 10)

			if (isNaN(wcoin) || !promoCode) {
				await context.send(
					`${await getUserMention(
						userId
					)}, Неверный формат команды. Используйте: /creatpromo [код] [сумма]`
				)
			} else {
				await addPromocode(promoCode, wcoin)
				await context.send(
					`${await getUserMention(
						userId
					)}, Промокод ${promoCode} создан с количеством WCoin: ${wcoin}.`
				)
			}
		} else {
			await context.send(
				`${await getUserMention(
					userId
				)}, 😡 У вас нет прав для выполнения этой команды.`
			)
		}
	} else if (message.startsWith('/usepromo')) {
		const [_, promoCode] = message.split(' ')

		if (!promoCode) {
			await context.send(
				`${await getUserMention(
					userId
				)}, ❌ Неверный формат команды. Используйте: /usepromo [код]`
			)
		} else {
			const promo = await getPromocode(promoCode)

			if (promo) {
				const alreadyUsed = await hasUsedPromocode(userId, promoCode)
				if (alreadyUsed) {
					await context.send(
						`${await getUserMention(
							userId
						)}, 🗿 Вы уже использовали этот промокод.`
					)
				} else {
					await updateUserWcoin(userId, promo.wcoin) // Обновляем баланс WCoin на значение промокода
					await markPromocodeAsUsed(userId, promoCode)
					const updatedUser = await getUser(userId) // Получаем обновленный профиль пользователя
					await context.send(
						`${await getUserMention(
							userId
						)}, 🎉 Промокод ${promoCode} успешно использован. Вам начислено ${
							promo.wcoin
						} WCoin.\nТеперь у вас ${updatedUser.wcoin} WCoin.`
					)
				}
			} else {
				await context.send(
					`${await getUserMention(userId)}, 🗿 Промокод не найден.`
				)
			}
		}
	} else if (message.startsWith('/delpromo')) {
		if (userId === 252840773) {
			const [_, promoCode] = message.split(' ')

			if (!promoCode) {
				await context.send(
					`${await getUserMention(
						userId
					)}, Неверный формат команды. Используйте: /delpromo [код]`
				)
			} else {
				await deletePromocode(promoCode)
				await context.send(
					`${await getUserMention(userId)}, Промокод ${promoCode} удален.`
				)
			}
		} else {
			await context.send(
				`${await getUserMention(
					userId
				)}, 😡 У вас нет прав для выполнения этой команды.`
			)
		}
	} else if (message === '/топ') {
		// Получаем топ пользователей по рейтингу
		const topUsersByRating = await getTopUsersByRating(15)
		let response = `${await getUserMention(
			userId
		)}, 👑 Топ пользователей по рейтингу:\n`
		topUsersByRating.forEach((user, index) => {
			response += `${index + 1}. [id${user.vk_id}|${user.nickname}] - ${
				user.rating
			} рейтинга\n`
		})

		// Получаем топ пользователей по WCoin
		const topUsersByWcoin = await getTopUsersByWcoin(15)
		response += `\n💰 Топ пользователей по WCoin:\n`
		topUsersByWcoin.forEach((user, index) => {
			response += `${index + 1}. [id${user.vk_id}|${user.nickname}] - ${
				user.wcoin
			} WCoin\n`
		})

		await context.send({
			message: response,
			disable_mentions: 1,
		})
	} else if (message === '/бонус') {
		await handleBonusCommand(context)
	}
	if (message === '/купить кейс') {
		await sendCaseList(context)
	} else if (message === '/купить кейс обычный') {
		await handleBuyCaseCommand(context, 'common', 400)
	} else if (message === '/купить кейс серебряный') {
		await handleBuyCaseCommand(context, 'silver', 900)
	} else if (message === '/купить кейс золотой') {
		await handleBuyCaseCommand(context, 'gold', 1300)
	} else if (message === '/купить кейс платиновый') {
		await handleBuyCaseCommand(context, 'platinum', 3200)
	} else if (message === '/купить кейс waynecase') {
		await handleBuyCaseCommand(context, 'wayne', 5000)
	} else if (message === '/кейсы') {
		const userCases = await getUserCases(userId)

		if (!userCases) {
			await context.send(
				`${await getUserMention(userId)}, 🗿 у вас еще нет купленных кейсов.`
			)
		} else {
			await context.send(`${await getUserMention(userId)}, 📦 Ваши кейсы:
                📦Обычный: ${userCases.common}
                📦Серебряный: ${userCases.silver}
                🎁Золотой: ${userCases.gold}
                🎁Платиновый: ${userCases.platinum}
                💼WayneCase: ${userCases.wayne}`)
		}
	}
	if (message === '/открыть кейс обычный') {
		await handleCaseOpenCommand(context, 'обычный')
	} else if (message === '/открыть кейс серебряный') {
		await handleCaseOpenCommand(context, 'серебряный')
	} else if (message === '/открыть кейс золотой') {
		await handleCaseOpenCommand(context, 'золотой')
	} else if (message === '/открыть кейс платиновый') {
		await handleCaseOpenCommand(context, 'платиновый')
	} else if (message === '/открыть кейс waynecase') {
		await handleCaseOpenCommand(context, 'wayne')
	} else if (message.startsWith('/сменить ник')) {
		const parts = message.split(' ')
		if (parts.length < 3) {
			await context.send(
				`${await getUserMention(
					userId
				)}, ✏ Пожалуйста, используйте формат команды "сменить ник [новый ник]".`
			)
		} else {
			const newNickname = parts.slice(2).join(' ').trim()
			if (newNickname.length === 0) {
				await context.send('😡 Ник не может быть пустым.')
			} else {
				const user = await getUser(userId)
				if (user) {
					await updateUserNickname(userId, newNickname)
					await context.send(
						`${await getUserMention(
							userId
						)}, 🎉 Ваш ник успешно изменен на ${newNickname}.`
					)
				} else {
					await context.send(
						`${await getUserMention(
							userId
						)}, 🗿 Вы не зарегистрированы. Напишите "reg", чтобы зарегистрироваться.`
					)
				}
			}
		}
	} else if (message.startsWith('/передать')) {
		const [_, targetId, wcoinAmount] = message.split(' ')
		await handleTransferWcoin(context, targetId, wcoinAmount)
	} else if (message.startsWith('/команды')) {
		await context.send(
			`${await getUserMention(
				userId
			)}, ⚙ Доступные команды: используйте "/".\n\n🏆Аккаунт:\n👤"профиль"\n💸"передать"\n💰"usepromo"\n📝"сменить ник"\n📈"рефералка".\n\n🏪WShop:\n📦Кейсы:\n🎒"кейсы"\n💳"купить кейс"\n🎰"открыть кейс [название]"\n🥄Лопаты:\n🎒"лопаты"\n💳"купить лопату [название_лопаты]"\n\n🎱Развлечения:\n🎲"бар [wbar]"\n💎"бонус"\n🍀"клады"\n🔥"событие"\n\n🛠Прочее:\n👑"топ"\n⛔"правила"\n💬"команды"\n🆘"помощь"\n\n🔮VIP🔮\n👘"мерч"`
		)
	} else if (message.startsWith('/правила')) {
		await context.send(
			`${await getUserMention(
				userId
			)}, ‼ не знание правил - не освобождает от ответственности. Любые ваши действия, нарушающие правила акции/бота/конкурса проекта Waynes, повлечет собой: предупреждение, обнуление, блокировку аккаунта.\n\n📌1.1 Запрещено спамить/флудить и писать бесмысленные сообщения, которые имеют цель, накрутить игровую валюту.\n📌1.2 Запрещено обманывать, прикреплять фотошопленные, старые док-ва выигрыша для получения приза.\n📌1.3 Запрещено вводить в заблуждение игроков, просить данные, пользоваться проектом Waynes в своих целях.\n\n⛔ЗАПОМНИТЕ⛔ - модерация Waynes не напишет вам в личные сообщения о выигрыша приза или раздачи промокода. 📖Вся актуальная информация высылается из официальных источников, либо письмом в официальную группу. Модерация не просит ваши личные данные/аккаунта от ORP, чтобы выплатить приз.`
		)
	} else if (message.startsWith('/помощь')) {
		await context.send(
			`${await getUserMention(
				userId
			)}, 💬 я подскажу, как можно общаться в нашем чате и получать призы, открывая кейсы, использовать промокоды и прочее.\n\nКак можно заработать WCoin?\nОбщайся в чате активнее, WCoin и рейтинг будет зарабатываться только от твоего общения, главное не нарушай правила.\nСтавь лайк = 10WCoin, комментируй = 15WCoin, репости = 50WCoin каждый пост официальной группы.\n\nКак мне доказать, что я выполняю условия программы?\nВ случае постов: ты отправляешь скриншот лайка/коммента/репоста записи в группе, в личные сообщения группы по форме(будет снизу).\nВ случае кейса: пересылаешь сообщение от бота и скриншот сообщения бота в чате(ничего не замазано/не срезано) в личные сообщения официальной группы.\n\nКакие официальные источники и кому доверять?\nНаша официальная группа: @club199010052 (Waynes Family ONLINE RP)\nБлог разработки: @club223891915 (Блог разработки | Waynes Family).\n\nНе пишите разработчикам/основателям/модераторам проекта, все вопросы решаются через официальную группу. Мы не занимаемся прокачкой аккаунтов, мы не пишем сами!(искл. написало официальное сообщество).\n\nФорма для выплаты:\nВыплата с поста/кейса:\nНик:\nБанк.счет:\nДок-ва:\n\nЯ заметил баг, что делать? Пишишь также в официальную группу с полным объяснением бага, как это произошло и были ли утери, для компенсации.`
		)
	} else if (message.startsWith('/открыть кейс')) {
		await context.send(
			`${await getUserMention(
				userId
			)}, ✂ для открытия кейса используйте команду: открыть кейс [название с маленькой буквы]`
		)
	} else if (message.startsWith('/-v')) {
		await context.send(`1.0.6`)
	} else if (message.startsWith('/рефералка')) {
		await context.send(
			`${await getUserMention(
				userId
			)}, Зовите своих друзей играть в нашего бота, открывать кейсы, развлекаться с новыми друзьями и зарабатывать WCoin!\n\nЗа приглашение, мы вам даем 400WCoin, а вашему другу 200WCoin!\n\nОтпишите нам в официальную группу -- [https://vk.com/waynes_family|Waynes Family ONLINE RP] и сообщите, что именно вы его пригласили.`
		)
	} else if (message.startsWith('/мерч')) {
		await context.send(
			`${await getUserMention(
				userId
			)}, У нас есть свой мерч! Покупай худи по цене ниже рынка и получай яркие эмоции по уличной прогулке или по дороге домой. Выделяйся с толпы вместе с нами!\n\nУ вас есть возможность купить даже за WCoin = 65.000, а если не хотите долго ждать = 2799р!\n\nПодробнее в нашей официальной группе.`
		)
	} else if (message.startsWith('/клады')) {
		await context.send(
			`${await getUserMention(
				userId
			)}, По миру найдено много кладов, покупай лопату и скорей за работу!\nИспользуй команду: /копать клад [название_лопаты].`
		)
	}
})

async function updateUserRating(vk_id, ratingIncrement) {
	return new Promise((resolve, reject) => {
		db.run(
			'UPDATE users SET rating = rating + ? WHERE vk_id = ?',
			[ratingIncrement, vk_id],
			function (err) {
				if (err) {
					reject(err)
				} else {
					console.log(`Обновлен рейтинг для пользователя ${vk_id}`)
					resolve()
				}
			}
		)
	})
}

async function getTopUsersByWcoin(limit) {
	return new Promise((resolve, reject) => {
		db.all(
			'SELECT vk_id, nickname, wcoin FROM users ORDER BY wcoin DESC LIMIT ?',
			[limit],
			(err, rows) => {
				if (err) reject(err)
				else resolve(rows)
			}
		)
	})
}

async function getTopUsersByRating(limit) {
	return new Promise((resolve, reject) => {
		db.all(
			'SELECT * FROM users ORDER BY rating DESC LIMIT ?',
			[limit],
			(err, rows) => {
				if (err) {
					reject(err)
				} else {
					resolve(rows)
				}
			}
		)
	})
}

vk.updates.start().catch(console.error)

setInterval(async () => {
	const users = await getAllUsers()
	const currentTimestamp = await getTimestampNow()

	for (const user of users) {
		if (currentTimestamp >= user.last_bonus_timestamp + oneHour) {
			// Если прошел час с последнего бонуса, обнуляем last_bonus_timestamp
			await updateLastBonusTimestamp(user.vk_id, 0)
		}
	}
}, 60000) // Проверяем каждую минуту
