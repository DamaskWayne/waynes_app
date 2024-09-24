const { VK, Keyboard } = require('vk-io')
const sqlite3 = require('sqlite3').verbose()
const { setInterval } = require('timers')

const vk = new VK({
	token:
		'vk1.a.Q9NkX2X7k4yvab34BKje68dL3oPj4PJASDuRlG6i2zmxz_QAyM3HK8D7vAM13nXeqyiInnEeC-RhjrM8-2S2KhiJ30WcnTKBoV928ugwl4VodYBiKChgq9UDwBULA6GsQ-cuPnzT8WYuy9AhaMnLtvXo0sUvjUkrsUeXLQa5BbB5nx1DyP4nJplvlQTx9OM1Ov2xn5VKxQ5o1_b1uGbJ4g',
})

const db = new sqlite3.Database('users.db')

const oneHour = 3600 // 1 час в секундах
const twoHours = 7200 // 2 часа в секундах
const userEnergy = {}; // Хранение энергии пользователей
const cooldownTime = 3600000; // 1 час в миллисекундах

db.serialize(() => {
	db.run(
		`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, vk_id INTEGER, nickname TEXT, status TEXT, wcoin INTEGER, rating INTEGER DEFAULT 0, last_bonus_timestamp INTEGER DEFAULT 0, last_shovel_purchase_timestamp INTEGER DEFAULT 0, rewards INTEGER DEFAULT 0, referral_code TEXT, referred_by TEXT, referral_level INTEGER DEFAULT 1, completed_tasks TEXT DEFAULT '')`
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

	db.run(`CREATE TABLE IF NOT EXISTS referrals (
    	id INTEGER PRIMARY KEY AUTOINCREMENT,
    	referrer_vk_id INTEGER,
    	referred_vk_id INTEGER,
    	FOREIGN KEY(referrer_vk_id) REFERENCES users(vk_id),
    	FOREIGN KEY(referred_vk_id) REFERENCES users(vk_id)
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
            last_battle_timestamp INTEGER DEFAULT 0,
			level INTEGER DEFAULT 1,
			required_items TEXT DEFAULT '{"level2": {"Эбонитовый меч": 2, "Эбонитовая броня": 2, "Посох Wayne": 3}, "level3": {"Эбонитовый меч": 4, "Эбонитовая броня": 4, "Посох Wayne": 5}}'
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
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            clan_id INTEGER NOT NULL,
            enemy_name TEXT NOT NULL,
            enemy_health INTEGER NOT NULL,
            clan_health INTEGER NOT NULL,
            last_battle_timestamp INTEGER NOT NULL,
            FOREIGN KEY (clan_id) REFERENCES clans(id)
        )
    `)

	db.run(`
    CREATE TABLE IF NOT EXISTS villages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        health INTEGER,
        clan_id INTEGER,
        is_in_battle INTEGER DEFAULT 0,
		attacking_clan_id INTEGER DEFAULT NULL,
		income_per_min REAL DEFAULT 0,
        FOREIGN KEY (clan_id) REFERENCES clans(id)
    )
`)

	db.run(`
    INSERT OR IGNORE INTO villages (name, health, clan_id, is_in_battle) VALUES 
    ('Waynes City', 1300, NULL, 0),
    ('Талорин', 1300, NULL, 0),
    ('Старый Хельмдорф', 1300, NULL, 0)
`)

	db.run(`
		CREATE TABLE IF NOT EXISTS crafted_items (
			user_id INTEGER,
			item_name TEXT,
			quantity INTEGER DEFAULT 1,
			PRIMARY KEY (user_id, item_name)
		)
	`)

	db.run(`
    CREATE TABLE IF NOT EXISTS clan_battle_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        challenger_clan_id INTEGER NOT NULL,
        opponent_clan_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        challenger_id INTEGER NOT NULL,
        FOREIGN KEY (challenger_clan_id) REFERENCES clans(id),
        FOREIGN KEY (opponent_clan_id) REFERENCES clans(id)
    )
`)

	db.run(`
    CREATE TABLE IF NOT EXISTS active_clan_wars (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        clan1_id INTEGER NOT NULL,
        clan2_id INTEGER NOT NULL,
        clan1_health INTEGER DEFAULT 1000,
        clan2_health INTEGER DEFAULT 1000,
        amount INTEGER NOT NULL,
        FOREIGN KEY (clan1_id) REFERENCES clans(id),
        FOREIGN KEY (clan2_id) REFERENCES clans(id)
    )
`)

	db.run(`
        CREATE TABLE IF NOT EXISTS fund (
    		balance INTEGER DEFAULT 0
		)
    `)

	db.run(`
        CREATE TABLE IF NOT EXISTS fund_contributions (
    		user_id INTEGER,
    		amount INTEGER,
    		FOREIGN KEY(user_id) REFERENCES users(vk_id)
		)
    `)
})

// Item
const craftedItemsList = ['Эбонитовый меч', 'Эбонитовая броня']

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

const craftingRecipes = {
	'Эбонитовая броня': {
		'Зелье огня': 6,
		'Платиновая стрела': 7,
		'Посох Wayne': 6
	},
	'Эбонитовый меч': {
		'Золотой меч': 6,
		'Ведро воды': 5,
		'Посох Wayne': 6
	},
	WCoin: {
		'Фрагменты WCoin': 25,
		'Посох Wayne': 2,
	},
}

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
	золотая: { attempts: 1, min: 95, max: 120, case: 'обычная' },
	платиновая: { attempts: 1, min: 255, max: 330, case: 'серебряная' },
	wayneлопата: { attempts: 1, min: 685, max: 730, case: 'золотая' },
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
const promoCodes = {}

const statuses = [
	'Яркий',
	'Любопытный',
	'Опытный',
	'Кристаллический инсайт',
	'Алмазный самбуфер',
	'Топовый рефер',
	'Gang',
	'Mafia',
	'Коп',
	'Учитель',
	'Медик',
	'Трейдер',
	'Устойчивый предприниматель',
	'Bitcoin',
	'Ton',
	'Миллионер',
	'Фармист WCoins',
	'Искусственный интеллект',
	'Gamer',
	'Юрист',
	'Клановод',
]

function generateReferralCode() {
	return Math.random().toString(36).substring(2, 8) // Генерирует случайный код
}

async function generateReferralCodeOld(userId) {
	const referralCode = `code_${userId}` // Генерация кода, можно использовать любой алгоритм
	await new Promise((resolve, reject) => {
		db.run(
			'UPDATE users SET referral_code = ? WHERE vk_id = ?',
			[referralCode, userId],
			err => {
				if (err) reject(err)
				else resolve()
			}
		)
	})
	return referralCode
}

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
async function updateUserWcoin(userId, amount, fromMessage = false) {
	const user = await getUser(userId)

	// Если это начисление за сообщение, проверяем статус
	if (fromMessage && user.status !== 'Яркий' && user.status !== 'Любопытный') {
		return // Если статус не подходит, не начисляем WCoin за сообщение
	}

	// Начисляем WCoin
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

async function handleMessage(context) {
	const userId = context.senderId
	const amount = 1 // Количество WCoin за сообщение

	// Начисляем WCoin только если статус "Яркий" или "Любопытный"
	await updateUserWcoin(userId, amount, true) // Передаем true для сообщений
}

async function updateUserStatus(userId, rating, context) {
	const user = await getUser(userId)
	let newStatus = user.status // По умолчанию сохраняем текущий статус
	let rewardWcoin = 0 // Награда за новый статус

	// Определяем новый статус на основе рейтинга
	if (rating >= 600 && user.status !== 'Опытный') {
		newStatus = 'Опытный'
		rewardWcoin = 800 // Награда за статус "Опытный"
	} else if (rating >= 200 && user.status === 'Яркий') {
		newStatus = 'Любопытный'
		rewardWcoin = 300 // Награда за статус "Любопытный"
	} else if (rating < 200 && user.status === 'Любопытный') {
		newStatus = 'Яркий'
	}

	// Если статус изменился, обновляем его в базе данных и начисляем награду
	if (newStatus !== user.status) {
		await db.run('UPDATE users SET status = ? WHERE vk_id = ?', [
			newStatus,
			userId,
		])

		// Начисляем WCoin, если есть награда за новый статус
		if (rewardWcoin > 0) {
			await updateUserWcoin(userId, rewardWcoin)

			// Отправляем сообщение пользователю
			await context.send(
				`${await getUserMention(
					userId
				)}, поздравляем! Вы достигли статуса "${newStatus}" и получили ${rewardWcoin} WCoin! 🎉`
			)
		}
	}

	return newStatus
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
	if (target.startsWith('https://vk.com/')) {
		const screenName = target.replace('https://vk.com/', '')
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
	} else if (target.startsWith('@')) {
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

async function getUserByName(username) {
	return new Promise((resolve, reject) => {
		db.get(
			'SELECT vk_id FROM users WHERE nickname = ?',
			[username],
			(err, row) => {
				if (err) {
					console.error(err)
					reject('Ошибка при получении данных о пользователе.')
				} else {
					resolve(row)
				}
			}
		)
	})
}

async function getUser(vk_id) {
	return new Promise((resolve, reject) => {
		db.get(
			`
            SELECT u.*, 
                   (SELECT c.name FROM clans c
                    JOIN clan_members cm ON c.id = cm.clan_id
                    WHERE cm.user_id = u.vk_id
                    LIMIT 1) AS clan_name
            FROM users u
            WHERE u.vk_id = ?
            `,
			[vk_id],
			(err, row) => {
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
			}
		)
	})
}

async function addUser(vk_id, nickname, status, wcoin, referralCode) {
	return new Promise((resolve, reject) => {
		db.run(
			'INSERT INTO users (vk_id, nickname, status, wcoin, referral_code, rating) VALUES (?, ?, ?, ?, ?, ?)',
			[vk_id, nickname, status, wcoin, referralCode, 0], // Новый пользователь начинает с 0 рейтинга
			function (err) {
				if (err) reject(err)
				else resolve()
			}
		)
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

const shovelTypeMapping = {
	common: 'обычная',
	silver: 'серебряная',
	gold: 'золотая',
	platinum: 'платиновая',
	wayne: 'wayneлопата',
}

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
    📦 Обычный кейс: 700 WCoin
    📦 Серебряный кейс: 3000 WCoin
    🎁 Золотой кейс: 4000 WCoin
    🎁 Платиновый кейс: 8000 WCoin
    💼 WayneCase: 10000 WCoin`)
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
	if (!user)
		return '📄 Вы не зарегистрированы. Напишите "/reg", чтобы зарегистрироваться.'

	// Проверяем, является ли предмет крафченным
	if (craftedItemsList.includes(itemName)) {
		// Проверяем, не выставлен ли предмет уже на продажу
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

		// Проверяем, есть ли у пользователя достаточное количество крафченных предметов
		const userItem = await new Promise((resolve, reject) => {
			db.get(
				'SELECT * FROM crafted_items WHERE user_id = ? AND item_name = ?',
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

		if (!userItem)
			return `${await getUserMention(
				userId
			)}, 😡 У вас нет такого крафченного предмета.`
		if (userItem.quantity < quantity)
			return `${await getUserMention(
				userId
			)}, 😡 У вас недостаточно количества крафченных предметов для продажи.`

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
	} else {
		// Продажа обычных предметов
		if (!itemList.includes(itemName))
			return '❌ Такого предмета не существует, убедитесь, что вы правильно ввели название предмета, либо формат команды.\n/wmarkets выставить [предмет] [кол-во] [цена за шт.]'

		// Проверяем, не выставлен ли предмет уже на продажу
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

		// Проверяем, есть ли у пользователя достаточное количество предметов
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

		if (!userItem)
			return `${await getUserMention(userId)}, 😡 У вас нет такого предмета.`
		if (userItem.quantity < quantity)
			return `${await getUserMention(
				userId
			)}, 😡 У вас недостаточно количества предметов для продажи.`

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
}

async function removeMarketItem(userId, itemName) {
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

	if (!itemExists)
		return '❌ Вы не выставляли этот предмет на продажу или введите название предмета.'

	return new Promise((resolve, reject) => {
		db.run(
			'DELETE FROM market WHERE user_id = ? AND item_name = ?',
			[userId, itemName],
			err => {
				if (err) {
					console.error(err)
					reject('Ошибка при удалении предмета с рынка.')
				} else {
					resolve('✅ Предмет успешно снят с продажи!')
				}
			}
		)
	})
}

async function showMarket() {
	return new Promise(async (resolve, reject) => {
		db.all('SELECT * FROM market', [], async (err, rows) => {
			if (err) {
				console.error(err)
				reject('Не удалось получить список товаров на рынке.')
			} else {
				// Получаем список всех пользователей для быстрого доступа к их никнеймам
				const users = await new Promise((resolve, reject) => {
					db.all('SELECT vk_id, nickname FROM users', [], (err, userRows) => {
						if (err) {
							reject(err)
						} else {
							const userMap = new Map(
								userRows.map(user => [user.vk_id, user.nickname])
							)
							resolve(userMap)
						}
					})
				})

				const marketList = rows
					.map(row => {
						const sellerNickname = users.get(row.user_id);
						const sellerLink = sellerNickname
							? `[id${row.user_id}|${sellerNickname}]`
							: 'Неизвестно'
						return `🙎‍♂ Продавец: ${sellerLink}\n💼 Предмет: ${row.item_name}, 🔖 Кол-во: ${row.quantity}\n💸 Цена: ${row.price} WCoin за штуку`
					})
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

		if (!marketItem) {
			return '🔎 Предмет не найден на рынке.\nВведите команду /wmarkets купить [ID/упоминание] [предмет]'
		}

		const totalPrice = marketItem.price * marketItem.quantity
		if (buyer.wcoin < totalPrice) {
			return '❌ Недостаточно средств для покупки.'
		}

		// Обновляем средства покупателя
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

		// Обновляем средства продавца
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

		// Обновляем количество предметов у продавца
		await new Promise((resolve, reject) => {
			db.run(
				'UPDATE user_items SET quantity = quantity - ? WHERE user_id = ? AND item_name = ? AND quantity >= ?',
				[marketItem.quantity, sellerId, itemName, marketItem.quantity],
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

		// Удаляем предмет с рынка, если количество равно или меньше 0
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

		return `💸 Вы успешно приобрели ${marketItem.quantity} ${itemName} за ${totalPrice} WCoin.\nПодробнее о ваших предметах: /предметы`
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
					reject('Не удалось получить предметы.')
				} else {
					const items = rows.reduce((acc, row) => {
						acc[row.item_name] = row.quantity
						return acc
					}, {})
					resolve(items)
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

// Craft

async function handleCraftCommand(context) {
	const message = context.text
	const userId = context.senderId
	const parts = message.split(' ')

	if (parts[0] !== '/крафт') {
		return
	}

	const itemName = parts.slice(1).join(' ')

	if (!itemName) {
		const recipeList = Object.keys(craftingRecipes)
			.map(item => {
				const recipe = craftingRecipes[item]
				const requirements = Object.entries(recipe)
					.map(([ingredient, quantity]) => `${quantity} ${ingredient}`)
					.join(', ')
				return `${item}: ${requirements}`
			})
			.join('\n\n')

		context.send(
			`📜 Привет, я Алекс. Я помогу тебе создать кузнечный предмет, но мне нужны ресурсы и 20 WCoin:\n\n${recipeList}\n\nИспользуй команду /крафт [Кузнечный предмет]`
		)
		return
	}

	if (itemName === 'WCoin') {
		const recipeForWcoin = {
			'Фрагменты WCoin': 25,
			'Посох Wayne': 2,
		}

		const userItems = await listUserItems(userId)
		const userWcoin = await getUserWcoin(userId)
		const missingItems = {}
		const insufficientItems = {}

		for (const [ingredient, quantity] of Object.entries(recipeForWcoin)) {
			const availableQuantity = userItems[ingredient] || 0
			if (availableQuantity < quantity) {
				insufficientItems[ingredient] = availableQuantity
				missingItems[ingredient] = quantity - availableQuantity
			}
		}

		if (Object.keys(missingItems).length > 0) {
			const missingItemsText = Object.entries(recipeForWcoin)
				.map(([item, qty]) => {
					const availableQty = userItems[item] || 0
					return `${availableQty}/${qty} ${item}`
				})
				.join(', ')
			context.send(
				`❌ Недостаточно ресурсов для крафта WCoin: ${missingItemsText}`
			)
			return
		}

		// Deduct resources for WCoin crafting
		for (const [ingredient, quantity] of Object.entries(recipeForWcoin)) {
			await updateUserItems(userId, ingredient, -quantity)
		}

		// Add 50 WCoin to the user's balance
		await updateUserWcoin(userId, 50)
		context.send(`✅ Вы получили 50 WCoin!`)
		return
	}

	if (!craftingRecipes[itemName]) {
		context.send('❌ Предмет не найден в рецептах крафта.')
		return
	}

	const recipe = craftingRecipes[itemName]
	const userItems = await listUserItems(userId)
	const userWcoin = await getUserWcoin(userId)
	const missingItems = {}
	const insufficientItems = {}

	for (const [ingredient, quantity] of Object.entries(recipe)) {
		const availableQuantity = userItems[ingredient] || 0
		if (availableQuantity < quantity) {
			insufficientItems[ingredient] = availableQuantity
			missingItems[ingredient] = quantity - availableQuantity
		}
	}

	if (userWcoin < 20) {
		context.send('❌ Недостаточно WCoin для крафта.')
		return
	}

	if (Object.keys(missingItems).length > 0) {
		const missingItemsText = Object.entries(recipe)
			.map(([item, qty]) => {
				const availableQty = userItems[item] || 0
				return `${availableQty}/${qty} ${item}`
			})
			.join(', ')
		context.send(`❌ Недостаточно ресурсов: ${missingItemsText}`)
		return
	}

	// Deduct WCoin
	await updateUserWcoin(userId, -20)

	// Deduct resources and add crafted item
	for (const [ingredient, quantity] of Object.entries(recipe)) {
		await updateUserItems(userId, ingredient, -quantity)
	}

	await updateUserItems(userId, itemName, 1)

	// Add crafted item to the database
	await addCraftedItemToDatabase(userId, itemName)

	context.send(`⚒✅ Отлично, держи свой предмет ${itemName}!`)
}

async function listCraftedItems(userId) {
	return new Promise((resolve, reject) => {
		db.all(
			'SELECT item_name, quantity FROM crafted_items WHERE user_id = ?',
			[userId],
			(err, rows) => {
				if (err) {
					console.error(err);
					reject('Failed to retrieve crafted items.');
				} else {
					const items = rows.length
						? rows.map(row => `${row.item_name}: ${row.quantity} шт.`).join('\n')
						: '❌ У вас нет кузнечных предметов.';
					resolve(`⚒ Кузнечные предметы:\n${items}`);
				}
			}
		);
	});
}

async function addCraftedItemToDatabase(userId, itemName) {
	return new Promise((resolve, reject) => {
		db.run(
			'INSERT INTO crafted_items (user_id, item_name, quantity) VALUES (?, ?, ?) ON CONFLICT(user_id, item_name) DO UPDATE SET quantity = quantity + ?',
			[userId, itemName, 1, 1],
			err => {
				if (err) {
					console.error(err)
					reject('Не удалось добавить скрафченный предмет.')
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
            SELECT c.*, u.nickname AS creator_nickname,
                   (SELECT COUNT(*) FROM clan_members cm WHERE cm.clan_id = c.id) AS member_count
            FROM clans c
            JOIN clan_members cm ON c.id = cm.clan_id
            JOIN users u ON c.creator_id = u.vk_id
            WHERE cm.user_id = ?
            `,
			[userId],
			(err, row) => {
				if (err) {
					console.error('Ошибка при получении данных о клане:', err)
					reject('Ошибка при получении данных о клане.')
				} else {
					resolve(row)
				}
			}
		)
	})
}

async function getClanById(clanId) {
	return new Promise((resolve, reject) => {
		db.get(
			`
            SELECT c.*, u.nickname AS creator_nickname,
                   (SELECT COUNT(*) FROM clan_members cm WHERE cm.clan_id = c.id) AS member_count
            FROM clans c
            JOIN users u ON c.creator_id = u.vk_id
            WHERE c.id = ?
            `,
			[clanId],
			(err, row) => {
				if (err) {
					console.error('Ошибка при получении данных о клане по ID:', err)
					reject('Ошибка при получении данных о клане по ID.')
				} else {
					resolve(row)
				}
			}
		)
	})
}

async function createClan(userId, clanName) {
	return new Promise((resolve, reject) => {
		getClanByUserId(userId)
			.then(existingClan => {
				if (existingClan) {
					reject(
						'❌ Вы уже находитесь в клане. Выйдите из него, чтобы создать новый.'
					)
					return
				}

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
			.catch(reject)
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

async function inviteMember(creatorId, invitee) {
	return new Promise((resolve, reject) => {
		getClanByUserId(creatorId)
			.then(clan => {
				if (!clan || clan.creator_id !== creatorId) {
					reject('😡 Вы не являетесь создателем клана.')
					return
				}

				// Используем resolveUserId для получения ID пользователя
				resolveUserId(invitee)
					.then(async userId => {
						if (!userId) {
							reject('❌ Пользователь не найден.')
							return
						}

						// Проверка на наличие пользователя в базе данных (зарегистрирован ли он)
						const registeredUser = await getUser(userId)
						if (!registeredUser) {
							reject('❌ Пользователь не зарегистрирован.')
							return
						}

						getClanByUserId(userId)
							.then(existingClan => {
								if (existingClan) {
									reject('❌ Пользователь уже находится в клане.')
									return
								}

								db.run(
									'INSERT INTO clan_members (user_id, clan_id) VALUES (?, ?)',
									[userId, clan.id],
									err => {
										if (err) {
											reject(err)
										} else {
											resolve('✅ Пользователь успешно приглашен в клан.')
										}
									}
								)
							})
							.catch(reject)
					})
					.catch(reject)
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
							{ name: 'Ледяная валькирия', health: 1200 },
							{ name: 'Красный дракон', health: 1200 },
							{ name: 'Темный рыцарь', health: 1200 },
							{ name: 'Огненный маг', health: 1200 },
						]
						const shuffledEnemies = enemies.sort(() => Math.random() - 0.5)

						// Выбираем первого врага после перемешивания
						const enemy = shuffledEnemies[0]

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
				db.get(
					'SELECT * FROM clan_battles WHERE clan_id = ?',
					[clan.id],
					(err, battle) => {
						if (err) {
							reject('Ошибка при проверке битвы.')
							return
						}
						if (battle) {
							reject('😡 Нельзя снимать WCoin во время активной битвы.')
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
									// Обновляем баланс создателя клана
									updateUserWcoin(userId, amount)
										.then(() => resolve())
										.catch(reject)
								}
							}
						)
					}
				)
			})
			.catch(reject)
	})
}

async function listClanMembers(clanId) {
	return new Promise((resolve, reject) => {
		db.all(
			'SELECT u.vk_id, u.nickname FROM users u JOIN clan_members cm ON u.vk_id = cm.user_id WHERE cm.clan_id = ?',
			[clanId],
			(err, rows) => {
				if (err) {
					reject('Ошибка при получении списка участников.')
				} else {
					resolve(rows)
				}
			}
		)
	})
}

async function handleClanList(context, clanId) {
	const members = await listClanMembers(clanId)
	const formattedList = members
		.map(member => `[id${member.vk_id}|${member.nickname}]`)
		.join('\n')
	context.send(`🛡 Участники клана:\n${formattedList}`, {disable_mentions: 1})
}

async function kickMember(creatorId, member) {
	return new Promise((resolve, reject) => {
		getClanByUserId(creatorId)
			.then(clan => {
				if (!clan || clan.creator_id !== creatorId) {
					reject('😡 Вы не являетесь создателем клана.')
					return
				}

				let memberIdPromise
				if (isNaN(parseInt(member))) {
					memberIdPromise = resolveUserId(member) // Используйте функцию resolveUserId для получения ID
				} else {
					memberIdPromise = Promise.resolve(parseInt(member))
				}

				memberIdPromise
					.then(memberId => {
						db.get(
							'SELECT * FROM clan_members WHERE user_id = ? AND clan_id = ?',
							[memberId, clan.id],
							(err, existingMember) => {
								if (err) {
									reject('Ошибка при проверке участника.')
									return
								}
								if (!existingMember) {
									reject('❌ Пользователь не найден в клане.')
								} else {
									db.run(
										'DELETE FROM clan_members WHERE user_id = ? AND clan_id = ?',
										[memberId, clan.id],
										err => {
											if (err) {
												reject(err)
											} else {
												resolve('✅ Пользователь успешно кикнут из клана.')
											}
										}
									)
								}
							}
						)
					})
					.catch(reject)
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
				reject('❌ Клан не найден.')
				return
			}

			const penaltyAmount = 1800 // фиксированный штраф
			const newBalance = clan.balance - penaltyAmount

			// Обновляем баланс клана
			db.run(
				'UPDATE clans SET balance = ? WHERE id = ?',
				[newBalance, clanId],
				err => {
					if (err) {
						reject('❌ Не удалось обновить баланс клана.')
					} else {
						// Удаляем запись о битве, чтобы завершить битву
						db.run(
							'DELETE FROM clan_battles WHERE clan_id = ?',
							[clanId],
							err => {
								if (err) {
									reject('❌ Не удалось завершить битву.')
								} else {
									resolve(penaltyAmount) // Возвращаем сумму штрафа
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
		'Зелье огня': 'Ледяная валькирия',
	}
	return itemDamageMap[itemName] === enemyName ? 50 : 30
}

async function healClan(userId, itemType) {
	const healAmount = itemType === 'Большая аптечка' ? 15 : 10

	return new Promise((resolve, reject) => {
		getClanByUserId(userId)
			.then(async clan => {
				if (!clan) {
					reject('❌ Вы не состоите в клане.')
					return
				}

				// Проверка на активную битву
				db.get(
					'SELECT * FROM clan_battles WHERE clan_id = ?',
					[clan.id],
					async (err, battle) => {
						if (err || !battle) {
							reject('❌ В данный момент нет активной битвы для вашего клана.')
							return
						}

						// Получаем предметы пользователя
						const userItems = await listUserItems(userId)

						// Проверяем, есть ли у пользователя необходимая аптечка
						if (!userItems[itemType] || userItems[itemType] < 1) {
							reject(`❌ У вас нет предмета "${itemType}".`)
							return
						}

						// Рассчитываем новое здоровье клана, не превышающее 1000
						const newClanHealth = Math.min(
							battle.clan_health + healAmount,
							1000
						)

						// Обновляем здоровье клана в активной битве
						db.run(
							'UPDATE clan_battles SET clan_health = ? WHERE clan_id = ?',
							[newClanHealth, clan.id],
							async err => {
								if (err) {
									reject('❌ Ошибка при лечении клана.')
								} else {
									// Списываем аптечку из инвентаря пользователя
									await updateUserItems(userId, itemType, -1)
									resolve(
										`🛡 Клан вылечен на ${healAmount} единиц здоровья. Текущее здоровье клана: ${newClanHealth}.`
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

//Wclan улучшения

async function upgradeClan(userId) {
	return new Promise((resolve, reject) => {
		getClanByUserId(userId)
			.then(async clan => {
				if (!clan || clan.creator_id !== userId) {
					reject('😡 Вы не являетесь создателем клана.')
					return
				}

				const itemsRequired = JSON.parse(clan.required_items)
				const currentLevel = clan.level
				let upgradeCost, nextLevelItems

				if (currentLevel === 1) {
					nextLevelItems = itemsRequired.level2
					upgradeCost = 4000
				} else if (currentLevel === 2) {
					nextLevelItems = itemsRequired.level3
					upgradeCost = 7000
				} else {
					reject('🔝 Ваш клан уже достиг максимального уровня.')
					return
				}

				// Проверяем наличие предметов у пользователя
				const userItems = await listUserItems(userId)

				console.log('Предметы пользователя:', userItems) // Для отладки
				console.log('Необходимые предметы для улучшения:', nextLevelItems) // Для отладки

				const hasAllItems = Object.keys(nextLevelItems).every(item => {
					const requiredQuantity = nextLevelItems[item]
					const userQuantity = userItems[item] || 0
					return userQuantity >= requiredQuantity
				})

				if (!hasAllItems) {
					reject(
						`❌ Не хватает предметов для улучшения.\nДля 2-го уровня необходимо:\n${itemsRequired.level2['Эбонитовый меч']}шт. Эбонитовый меч\n${itemsRequired.level2['Эбонитовая броня']}шт. Эбонитовая броня\n${itemsRequired.level2['Посох Wayne']}шт. Посох Wayne\n4000 WCoin\n\nДля 3-го уровня необходимо:\n${itemsRequired.level3['Эбонитовый меч']}шт. Эбонитовый меч\n${itemsRequired.level3['Эбонитовая броня']}шт. Эбонитовая броня\n${itemsRequired.level3['Посох Wayne']}шт. Посох Wayne\n7000 WCoin`
					)
					return
				}

				// Проверяем баланс клана
				if (clan.balance < upgradeCost) {
					reject(
						'😡 Недостаточно средств в общаке для улучшения.\nДля 2-го уровня необходимо: 4000 WCoin\nДля 3-го уровня необходимо: 7000 WCoin\n'
					)
					return
				}

				// Списываем предметы и средства
				db.run(
					'UPDATE clans SET balance = balance - ?, level = level + 1 WHERE id = ?',
					[upgradeCost, clan.id],
					err => {
						if (err) {
							reject('Ошибка при улучшении клана.')
							return
						}

						// Списываем предметы
						const itemUpdates = Object.keys(nextLevelItems).map(item => {
							return new Promise((itemResolve, itemReject) => {
								db.run(
									'UPDATE user_items SET quantity = quantity - ? WHERE user_id = ? AND item_name = ?',
									[nextLevelItems[item], userId, item],
									err => {
										if (err) {
											itemReject('Ошибка при списании предметов.')
										} else {
											itemResolve()
										}
									}
								)
							})
						})

						Promise.all(itemUpdates)
							.then(() => {
								resolve(
									'✅ Клан успешно улучшен до уровня ' +
										(currentLevel + 1) +
										'!'
								)
							})
							.catch(reject)
					}
				)
			})
			.catch(reject)
	})
}

// Wclan villages

async function getVillageByName(name) {
	return new Promise((resolve, reject) => {
		db.get('SELECT * FROM villages WHERE name = ?', [name], (err, row) => {
			if (err) reject(err)
			else resolve(row)
		})
	})
}

async function getVillageByClanId(clanId) {
	return new Promise((resolve, reject) => {
		db.get('SELECT * FROM villages WHERE clan_id = ?', [clanId], (err, row) => {
			if (err) reject(err)
			else resolve(row)
		})
	})
}

// Функция для получения деревни в активной битве по id клана
async function getVillageInBattleByClanId(clanId) {
	return new Promise((resolve, reject) => {
		// Ищем деревню, где attacking_clan_id совпадает с clanId атакующего клана
		db.get(
			'SELECT * FROM villages WHERE attacking_clan_id = ? AND is_in_battle = 1',
			[clanId],
			(err, row) => {
				if (err) reject(err)
				else resolve(row)
			}
		)
	})
}

async function updateVillageHealth(villageId, health) {
	return new Promise((resolve, reject) => {
		db.run(
			'UPDATE villages SET health = ? WHERE id = ?',
			[health, villageId],
			err => {
				if (err) reject(err)
				else resolve()
			}
		)
	})
}

async function updateClanHealth(clanId, health) {
	return new Promise((resolve, reject) => {
		db.run(
			'UPDATE clans SET health = ? WHERE id = ?',
			[health, clanId],
			err => {
				if (err) reject(err)
				else resolve()
			}
		)
	})
}

async function captureVillage(clanId, villageId) {
	return new Promise((resolve, reject) => {
		db.run(
			'UPDATE villages SET clan_id = ?, health = 1300, is_in_battle = 0 WHERE id = ?',
			[clanId, villageId],
			err => {
				if (err) reject(err)
				else resolve()
			}
		)
	})
}

async function setVillageBattleStatus(villageId, isInBattle) {
	return new Promise((resolve, reject) => {
		db.run(
			'UPDATE villages SET is_in_battle = ? WHERE id = ?',
			[isInBattle, villageId],
			err => {
				if (err) reject(err)
				else resolve()
			}
		)
	})
}


async function getVillagesByClanId(clanId) {
	return new Promise((resolve, reject) => {
		db.all(
			'SELECT name FROM villages WHERE clan_id = ?',
			[clanId],
			(err, rows) => {
				if (err) reject(err)
				else resolve(rows)
			}
		)
	})
}

async function updateVillageClan(villageId, clanId) {
	return db.run(`UPDATE villages SET clan_id = ? WHERE id = ?`, [
		clanId,
		villageId,
	])
}

async function setAttackingClan(villageId, clanId) {
	await db.run('UPDATE villages SET attacking_clan_id = ? WHERE id = ?', [
		clanId,
		villageId,
	])
}

async function startBattleWithVillage(userId, village, context) {
	const clan = await getClanByUserId(userId)

	if (!clan) {
		context.send('❌ Вы не состоите в клане.')
		return
	}

	// Проверка на активную битву
	if (village.is_in_battle) {
		context.send('❌ Эта деревня уже находится в битве.')
		return
	}

	// Если деревня никем не захвачена, устанавливаем клан как атакующий
	if (village.clan_id === null) {
		await updateVillageClan(village.id, clan.id) // Захватываем деревню для клана
	}

	// Устанавливаем деревню как находящуюся в битве и фиксируем атакующий клан
	await setVillageBattleStatus(village.id, 1)
	await setAttackingClan(village.id, clan.id)

	// Сбрасываем здоровье деревни и клана
	await updateVillageHealth(village.id, 1300)
	await updateClanHealth(clan.id, 1000)

	context.send(`🔥 Началась битва с деревней "${village.name}"!\nИспользуйте /wclan атака [название предмета] или /wclan атака\n/wclan healv [Легкая аптечка или Большая аптечка]`)
}

async function initializeVillageIncome() {
	db.run('UPDATE villages SET income_per_min = ? WHERE name = ?', [
		0.83,
		'Талорин',
	])
	db.run('UPDATE villages SET income_per_min = ? WHERE name = ?', [
		0.90,
		'Waynes City',
	])
	db.run('UPDATE villages SET income_per_min = ? WHERE name = ?', [
		0.79,
		'Старый Хельмдорф',
	])
	console.log('Доходы деревень были обновлены.')
}

// Запустите скрипт для обновления дохода деревень
initializeVillageIncome()

// Функция для получения всех кланов
async function getAllClans() {
	return new Promise((resolve, reject) => {
		db.all(
			'SELECT id, name, balance FROM clans',
			[],
			(err, rows) => {
				if (err) reject(err)
				else resolve(rows)
			}
		)
	})
}

// Функция для обновления баланса клана
async function updateClanBalance(clanId, amount) {
	return new Promise((resolve, reject) => {
		db.run(
			'UPDATE clans SET balance = balance + ? WHERE id = ?',
			[amount, clanId],
			(err) => {
				if (err) reject(err)
				else resolve()
			}
		)
	})
}

async function getVillagesByClanIdWithIncome(clanId) {
	return new Promise((resolve, reject) => {
		db.all(
			'SELECT name, income_per_min FROM villages WHERE clan_id = ?',
			[clanId],
			(err, rows) => {
				if (err) reject(err)
				else resolve(rows)
			}
		)
	})
}

async function addIncomeToClanFunds() {
	const clans = await getAllClans()

	for (const clan of clans) {
		const villages = await getVillagesByClanIdWithIncome(clan.id)
		const totalIncomePerMinute = villages.reduce(
			(acc, v) => acc + v.income_per_min,
			0
		)

		if (totalIncomePerMinute > 0) {
			await updateClanBalance(clan.id, totalIncomePerMinute)
		}
	}
}

// Запускаем каждую минуту
setInterval(addIncomeToClanFunds, 60 * 1000)

// wclan battle_clans
/*
async function getActiveBattleByClanId(clanId) {
	return new Promise((resolve, reject) => {
		db.get(
			`SELECT * FROM active_clan_wars WHERE clan1_id = ? OR clan2_id = ?`,
			[clanId, clanId],
			(err, row) => {
				if (err) {
					reject(err)
				} else {
					resolve(row)
				}
			}
		)
	})
}
*/
// fund

async function depositToFund(userId, amount) {
	try {
		// Проверяем, достаточно ли WCoin у пользователя
		const userWcoin = await getUserWcoin(userId)
		if (userWcoin < amount) {
			return 'Недостаточно WCoin для пополнения фонда.'
		}

		// Обновляем WCoin пользователя
		await updateUserWcoin(userId, -amount)

		// Получаем текущий баланс фонда
		const fund = await new Promise((resolve, reject) => {
			db.get('SELECT balance FROM fund', (err, row) => {
				if (err) reject(err)
				else resolve(row ? row.balance : null)
			})
		})

		// Если фонда нет, создаем запись с балансом 0
		if (fund === null) {
			await new Promise((resolve, reject) => {
				db.run('INSERT INTO fund (balance) VALUES (0)', function (err) {
					if (err) reject(err)
					else resolve()
				})
			})
		}

		// Обновляем фонд
		await new Promise((resolve, reject) => {
			db.run('UPDATE fund SET balance = balance + ?', [amount], function (err) {
				if (err) reject(err)
				else resolve()
			})
		})

		// Обновляем таблицу для отслеживания пополнений
		await new Promise((resolve, reject) => {
			db.run(
				'INSERT INTO fund_contributions (user_id, amount) VALUES (?, ?)',
				[userId, amount],
				function (err) {
					if (err) reject(err)
					else resolve()
				}
			)
		})

		return `Вы успешно пополнили фонд на ${amount} WCoin.`
	} catch (error) {
		console.error('Ошибка при пополнении фонда:', error)
		return 'Произошла ошибка при пополнении фонда.'
	}
}

async function showFund(context) {
	try {
		const fundBalance = await new Promise((resolve, reject) => {
			db.get('SELECT balance FROM fund', (err, row) => {
				if (err) reject(err)
				else resolve(row ? row.balance : 0)
			})
		})

		const topContributors = await new Promise((resolve, reject) => {
			db.all(
				'SELECT user_id, SUM(amount) as total_amount FROM fund_contributions GROUP BY user_id ORDER BY total_amount DESC LIMIT 10',
				(err, rows) => {
					if (err) reject(err)
					else resolve(rows)
				}
			)
		})

		let response = `💰 Баланс фонда: ${fundBalance} WCoin\n\nХочешь быть в топе? Пиши /фонд пополнить [сумма]\n\nТоп 10 пользователей, пополнивших фонд:\n`

		for (const contributor of topContributors) {
			const user = await getUser(contributor.user_id)
			const nickname = user ? user.nickname : 'Неизвестно'
			response += `• [id${contributor.user_id}|${nickname}] - ${contributor.total_amount} WCoin\n`
		}

		context.send(response, { disable_mentions: 1 }) // Правильное использование disable_mentions
	} catch (error) {
		console.error('Ошибка при отображении фонда:', error)
		context.send('Произошла ошибка при отображении фонда.', {
			disable_mentions: 1,
		})
	}
}

let currentQuest = null
const lastAttackTime = {}
const allowedIds = [252840773, 422202607]

vk.updates.on('message_new', async context => {
	const message = context.text ? context.text : ''
	const userId = context.senderId
	// Проверяем, зарегистрирован ли пользователь
	const user = await getUser(userId)

	if (user) {
		// Начисляем рейтинг и обновляем статус, только если пользователь уже зарегистрирован
		await updateUserRating(userId, 1)

		// Получаем обновленный рейтинг пользователя
		const updatedUser = await getUser(userId)

		// Обновляем статус с передачей context
		const newStatus = await updateUserStatus(
			userId,
			updatedUser.rating,
			context
		)

		// Если статус изменился, уведомляем пользователя
		if (newStatus !== updatedUser.status) {
			await context.send(`🎉 Ваш новый статус: ${newStatus}!`)
		}
	}

	if (message === '/панель' || message === '/п') {
		await context.send({
			message: 'Открыта панель управления:',
			keyboard: Keyboard.builder()
				.textButton({
					label: 'Бонус',
					color: Keyboard.POSITIVE_COLOR,
					payload: { command: 'bonus' },
				})
				.textButton({
					label: 'Лопаты',
					color: Keyboard.POSITIVE_COLOR,
					payload: { command: 'shovels' },
				})
				.row()
				.textButton({
					label: 'Событие',
					color: Keyboard.POSITIVE_COLOR,
					payload: { command: 'quest' },
				})
				.textButton({
					label: 'Клады',
					color: Keyboard.POSITIVE_COLOR,
					payload: { command: 'treasures' },
				})
				.row()
				.textButton({
					label: 'Мини игры',
					color: Keyboard.PRIMARY_COLOR,
					payload: { command: 'games' },
				})
				.textButton({
					label: 'Команды',
					color: Keyboard.PRIMARY_COLOR,
					payload: { command: 'commands' },
				})
				.row()
				.textButton({
					label: 'Ивент',
					color: Keyboard.SECONDARY_COLOR,
					payload: { command: 'event' },
				})
				.row()
				.textButton({
					label: 'Реферальная программа',
					color: Keyboard.SECONDARY_COLOR,
					payload: { command: 'ref' },
				})
				.row()
				.textButton({
					label: 'Закрыть панель',
					color: Keyboard.NEGATIVE_COLOR,
					payload: { command: 'close_panel' },
				})
				.inline(false)
				.oneTime(false),
		})
		return
	}

	// Проверка, что было нажатие на кнопку
	if (context.messagePayload) {
		const command = context.messagePayload.command

		// Обработка бонуса
		if (command === 'bonus') {
			await handleBonusCommand(context)

			// Повторно отображаем панель после нажатия на "Бонус"
			await context.send({
				message: 'Открыта панель управления:',
				keyboard: Keyboard.builder()
					.textButton({
						label: 'Бонус',
						color: Keyboard.POSITIVE_COLOR,
						payload: { command: 'bonus' },
					})
					.textButton({
						label: 'Лопаты',
						color: Keyboard.POSITIVE_COLOR,
						payload: { command: 'shovels' },
					})
					.row()
					.textButton({
						label: 'Событие',
						color: Keyboard.POSITIVE_COLOR,
						payload: { command: 'quest' },
					})
					.textButton({
						label: 'Клады',
						color: Keyboard.POSITIVE_COLOR,
						payload: { command: 'treasures' },
					})
					.row()
					.textButton({
						label: 'Мини игры',
						color: Keyboard.PRIMARY_COLOR,
						payload: { command: 'games' },
					})
					.textButton({
						label: 'Команды',
						color: Keyboard.PRIMARY_COLOR,
						payload: { command: 'commands' },
					})
					.row()
					.textButton({
						label: 'Ивент',
						color: Keyboard.SECONDARY_COLOR,
						payload: { command: 'event' },
					})
					.row()
					.textButton({
						label: 'Реферальная программа',
						color: Keyboard.SECONDARY_COLOR,
						payload: { command: 'ref' },
					})
					.row()
					.textButton({
						label: 'Закрыть панель',
						color: Keyboard.NEGATIVE_COLOR,
						payload: { command: 'close_panel' },
					})
					.inline(false)
					.oneTime(false),
			})
		}

		// Обработка команды закрытия панели
		else if (command === 'close_panel') {
			await context.send({
				message:
					'Панель закрыта.\nДля повторного открытия, напишите /панель или /п',
				keyboard: Keyboard.builder().oneTime(), // Убираем кнопки
			})
		} else if (command === 'some_command') {
			try {
				// Проверка и генерация реферального кода
				const user = await new Promise((resolve, reject) => {
					db.get(
						'SELECT * FROM users WHERE vk_id = ?',
						[context.senderId],
						(err, row) => {
							if (err) reject(err)
							else resolve(row)
						}
					)
				})

				if (!user) {
					await context.send('Пользователь не найден.')
					return
				}

				// Генерируем реферальный код, если его нет
				if (!user.referral_code) {
					await generateReferralCodeOld(user.vk_id)
				}

				// Ваш код для обработки команды
				await context.send('Ваша команда выполнена!')
			} catch (error) {
				console.error('Ошибка при выполнении команды:', error)
				await context.send('Произошла ошибка при выполнении команды.')
			}
		} else if (command === 'ref') {
			try {
				console.log('Executing db.get query for user:', context.senderId)

				// Получаем информацию о пользователе
				const user = await new Promise((resolve, reject) => {
					db.get(
						'SELECT * FROM users WHERE vk_id = ?',
						[context.senderId],
						(err, row) => {
							if (err) reject(err)
							else resolve(row)
						}
					)
				})

				if (!user) {
					await context.send('Пользователь не найден.')
					return
				}

				console.log('Executing db.all query for referred users...')

				// Получаем список пользователей, которые использовали реферальный код
				const referredUsers = await new Promise((resolve, reject) => {
					db.all(
						'SELECT u.nickname FROM users u JOIN referrals r ON u.vk_id = r.referred_vk_id WHERE r.referrer_vk_id = ?',
						[context.senderId],
						(err, rows) => {
							if (err) reject(err)
							else resolve(rows)
						}
					)
				})

				const referredCount = referredUsers.length // Количество приглашенных
				const referredList =
					referredUsers.map(user => user.nickname).join(', ') || 'никого'
				const referralCode = user.referral_code || 'Не установлен'

				// Получаем ник пригласившего пользователя
				const referrer = await new Promise((resolve, reject) => {
					db.get(
						'SELECT nickname FROM users WHERE vk_id = ?',
						[user.referred_by],
						(err, row) => {
							if (err) reject(err)
							else resolve(row)
						}
					)
				})
				const referredBy = referrer ? referrer.nickname : 'Никто'

				// Уровень реферала и награда
				const referralLevel = user.referral_level
				let task, reward
				const completedTasks = [] // Создаем массив завершенных заданий

				// Добавляем завершенные задания в зависимости от уровня
				if (referralLevel >= 1) {
					completedTasks.push('Пригласить 1 чел')
				}
				if (referralLevel >= 2) {
					completedTasks.push('Пригласить 2 чел')
				}
				if (referralLevel >= 3) {
					completedTasks.push('Пригласить 5 чел')
				}
				if (referralLevel >= 4) {
					completedTasks.push('Пригласить 7 чел')
				}

				// Устанавливаем текущую задачу и награду
				switch (referralLevel) {
					case 1:
						task = 'Пригласить 1 чел'
						reward = '150WCoin'
						break
					case 2:
						task = 'Пригласить 2 чел'
						reward = '300WCoin'
						break
					case 3:
						task = 'Пригласить 5 чел'
						reward = '600WCoin'
						break
					case 4:
						task = 'Пригласить 7 чел'
						reward = '1000WCoin'
						break
					default:
						task = 'Завершены все задания'
						reward = 'Нет награды'
				}

				// Формируем список завершенных заданий
				const completedTasksList = completedTasks.length
					? completedTasks.map(t => `✅ ${t}`).join('\n')
					: 'Нет завершенных заданий'

				// Отправляем сообщение пользователю
				await context.send({
					message: `Вы пригласили: ${referredCount} чел.\nОтправь код другу: /ввести код ${referralCode}\nВас пригласил: ${referredBy}\n\nВаш уровень реферала: ${referralLevel}\n${task}\nНаграда: ${reward}\n\nСписок приглашенных: ${referredList}\n\n✅ Завершенные задания:\n${completedTasksList}`,
				})
			} catch (error) {
				console.error('Ошибка при выполнении запроса:', error)
				await context.send('Произошла ошибка при выполнении запроса.')
			}
		} else if (command === 'quest') {
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
		} else if (command === 'close_panel') {
			await context.send({
				message: 'Панель закрыта.',
				keyboard: Keyboard.builder().oneTime(), // Убираем кнопки
			})
		} else if (command === 'games') {
			await context.send(
				`${await getUserMention(
					userId
				)}, 🎮 Играй в мини-игры и зарабатывай больше WCoin!\n\n/wbar - создавай комнаты или принимай ставки. Осторожно, можно увлечься.\n\n/тап - просто пиши команду, прокачивай её и зарабатывай WCoin (запрещено использовать в беседах!)\n\nСкоро будет больше игр...`
			)
		} else if (command === 'commands') {
			await context.send(
				`${await getUserMention(
					userId
				)}, ⚙ Доступные команды: используйте "/".\n\n🏆Аккаунт:\n👤"профиль"\n💸"передать"\n💰"usepromo"\n📝"сменить ник"\n📈"рефералка"\n"ref".\n\n🏪WShop:\n🛍"Рынок[wmarkets]"\n📦Кейсы:\n🎒"кейсы"\n💳"купить кейс"\n🎰"открыть кейс [название]"\n🥄Лопаты:\n🎒"лопаты"\n💳"купить лопату [название_лопаты]"\n\n🎱Развлечения:\n🛡"Клан[wclan]"\n🎲"бар [wbar]"\n💎"бонус"\n🍀"клады"\n🔥"событие"\n👉"тапалка"\n🏦"фонд"\n📈"winvest"\n\n🛠Прочее:\n💻"панель(/п)"\n👑"топ"\n⛔"правила"\n💬"команды"\n🆘"помощь"\n\n🔮VIP🔮\n👘"мерч"\n🥇"vip"`
			)
		} else if (command === 'event') {
			await context.send(
				`${await getUserMention(
					userId
				)}, WStars: 0⭐\n\nСписок доступных квестов:\n--Тестовое задание. Награда: 1WStars [✅]\n--Тестовое задание. Награда: 100WCoin [❌]\n--Тестовое задание. Награда: 1⭐ [ ]\n\n-Тестовое задание\nНаграда: 1WStars\n\nОбмен WCoin на WStars по курсу 1⭐ = WCoin\nОбменять звездочки на Дроп - /vip`
			)
		} else if (command === 'treasures') {
			await context.send({
				message:
					'Выберите тип лопаты для копания клада:\n\nИнформация по лопатам: /лопаты',
				keyboard: Keyboard.builder()
					.textButton({
						label: 'Копать клад обычная',
						color: Keyboard.POSITIVE_COLOR,
						payload: { command: 'dig_common' },
					})
					.row()
					.textButton({
						label: 'Копать клад серебряная',
						color: Keyboard.POSITIVE_COLOR,
						payload: { command: 'dig_silver' },
					})
					.row()
					.textButton({
						label: 'Копать клад золотая',
						color: Keyboard.POSITIVE_COLOR,
						payload: { command: 'dig_gold' },
					})
					.row()
					.textButton({
						label: 'Копать клад платиновая',
						color: Keyboard.POSITIVE_COLOR,
						payload: { command: 'dig_platinum' },
					})
					.row()
					.textButton({
						label: 'Копать клад wayneлопата',
						color: Keyboard.POSITIVE_COLOR,
						payload: { command: 'dig_wayne' },
					})
					.row()
					.textButton({
						label: 'Назад',
						color: Keyboard.NEGATIVE_COLOR,
						payload: { command: 'back_to_main' },
					})
					.inline(false)
					.oneTime(false),
			})
		}

		// Обработка перехода в меню лопат
		else if (command === 'shovels') {
			await context.send({
				message:
					'Выберите лопату для покупки:\n\nИнформация по лопатам:\nОбычная: 20 WCoin\nСеребряная: 50 WCoin\nЗолотая: 100 WCoin\nПлатиновая: 300 WCoin\nWayneлопата: 700 WCoin.',
				keyboard: Keyboard.builder()
					.textButton({
						label: 'Купить лопату обычная',
						color: Keyboard.POSITIVE_COLOR,
						payload: { command: 'buy_shovel_common' },
					})
					.row()
					.textButton({
						label: 'Купить лопату серебряная',
						color: Keyboard.POSITIVE_COLOR,
						payload: { command: 'buy_shovel_silver' },
					})
					.row()
					.textButton({
						label: 'Купить лопату золотая',
						color: Keyboard.POSITIVE_COLOR,
						payload: { command: 'buy_shovel_gold' },
					})
					.row()
					.textButton({
						label: 'Купить лопату платиновая',
						color: Keyboard.POSITIVE_COLOR,
						payload: { command: 'buy_shovel_platinum' },
					})
					.row()
					.textButton({
						label: 'Купить лопату wayneлопата',
						color: Keyboard.POSITIVE_COLOR,
						payload: { command: 'buy_shovel_wayne' },
					})
					.row()
					.textButton({
						label: 'Назад',
						color: Keyboard.NEGATIVE_COLOR,
						payload: { command: 'back_to_main' },
					})
					.inline(false)
					.oneTime(false),
			})
		} else if (command.startsWith('dig_')) {
			const shovelType = command.split('_')[1] // Получаем тип лопаты на английском
			const shovelTypeRu = shovelTypeMapping[shovelType] // Переводим на русский

			// Проверяем, что лопата указана корректно
			if (!shovelTypeRu) {
				await context.send(
					`${await getUserMention(userId)}, ❌ Неверный тип лопаты.`
				)
				return
			}

			// Проверка на наличие лопаты у пользователя
			const userShovels = await getUserShovels(userId)
			if (!userShovels || userShovels[shovelType] <= 0) {
				await context.send(
					`${await getUserMention(
						userId
					)}, ❌ У вас нет ${shovelTypeRu} лопаты.`
				)
				return
			}

			// Расчет награды
			const reward = calculateReward(shovelRewards[shovelTypeRu])
			const randomItem = itemList[Math.floor(Math.random() * itemList.length)]
			const quantity = Math.floor(Math.random() * 3) + 1

			// Обновляем инвентарь и награду пользователя
			await updateUserItems(userId, randomItem, quantity)
			await updateUserShovels(userId, shovelTypeRu, -1) // Уменьшаем количество лопат
			await updateUserRewards(userId, reward)

			// Отправляем сообщение с наградой
			await context.send(
				`${await getUserMention(
					userId
				)}, 🤑 Вы нашли клад! Ваш приз: ${reward} WCoin и ${quantity} шт. ${randomItem}!\nВозвращайтесь, когда снова купите лопату.`
			)
		}

		// Обработка покупки лопаты
		else if (command.startsWith('buy_shovel_')) {
			const shovelType = command.split('_')[2] // Извлекаем тип лопаты из команды
			const shovelTypeRu = shovelTypeMapping[shovelType]
			if (!shovelTypeRu) {
				await context.send(
					`❌ ${await getUserMention(
						userId
					)}, Неверный тип лопаты. Используйте название лопаты с окончанием "ая".`
				)
				return
			}

			await handleShovelPurchase(context, context.senderId, shovelTypeRu)
		}

		// Обработка кнопки "Назад" для возврата в главное меню
		else if (command === 'back_to_main') {
			await context.send({
				message: 'Открыта панель управления:',
				keyboard: Keyboard.builder()
					.textButton({
						label: 'Бонус',
						color: Keyboard.POSITIVE_COLOR,
						payload: { command: 'bonus' },
					})
					.textButton({
						label: 'Лопаты',
						color: Keyboard.POSITIVE_COLOR,
						payload: { command: 'shovels' },
					})
					.row()
					.textButton({
						label: 'Событие',
						color: Keyboard.POSITIVE_COLOR,
						payload: { command: 'quest' },
					})
					.textButton({
						label: 'Клады',
						color: Keyboard.POSITIVE_COLOR,
						payload: { command: 'treasures' },
					})
					.row()
					.textButton({
						label: 'Мини игры',
						color: Keyboard.PRIMARY_COLOR,
						payload: { command: 'games' },
					})
					.textButton({
						label: 'Команды',
						color: Keyboard.PRIMARY_COLOR,
						payload: { command: 'commands' },
					})
					.row()
					.textButton({
						label: 'Ивент',
						color: Keyboard.SECONDARY_COLOR,
						payload: { command: 'event' },
					})
					.row()
					.textButton({
						label: 'Реферальная программа',
						color: Keyboard.SECONDARY_COLOR,
						payload: { command: 'ref' },
					})
					.row()
					.textButton({
						label: 'Закрыть панель',
						color: Keyboard.NEGATIVE_COLOR,
						payload: { command: 'close_panel' },
					})
					.inline(false)
					.oneTime(false),
			})
		}
	}

	// Обработка команды /бонус
	else if (message === '/бонус') {
		await handleBonusCommand(context)
	}

	// Функция расчета награды
	function calculateReward(shovel) {
		const min = shovel.min
		const max = shovel.max
		const reward = Math.floor(Math.random() * (max - min + 1)) + min
		return reward
	}

	// Функция обработки покупки лопаты
	async function handleShovelPurchase(context, userId, shovelType) {
		const shovelPrices = {
			обычная: 20,
			серебряная: 50,
			золотая: 100,
			платиновая: 300,
			wayneлопата: 700,
		}

		if (!shovelPrices[shovelType]) {
			await context.send(
				`❌ ${await getUserMention(
					userId
				)}, Неверный тип лопаты. Используйте название лопаты с окончанием "ая".`
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
		const twoHours = 2 * 60 * 60 * 1000 // 2 часа в миллисекундах

		if (currentTimestamp < lastPurchaseTimestamp + twoHours) {
			const remainingTimeMs =
				lastPurchaseTimestamp + twoHours - currentTimestamp
			const remainingMinutes = Math.floor(remainingTimeMs / 1000 / 60)
			const hours = Math.floor(remainingMinutes / 60)
			const minutes = remainingMinutes % 60

			// Формируем сообщение о времени
			let timeMessage = ''
			if (hours > 0) {
				timeMessage += `${hours} час${hours > 1 ? 'а' : ''}`
			}
			if (minutes > 0 || hours === 0) {
				// Если есть хотя бы одна минута или нет часов
				if (hours > 0) timeMessage += ' и '
				timeMessage += `${minutes} минут`
			}

			// Отправляем сообщение с актуальным временем
			await context.send(
				`❌ ${await getUserMention(
					userId
				)}, Вы уже покупали лопату. Следующую можно купить через ${timeMessage}.`
			)
			return
		}

		const shovelPrice = shovelPrices[shovelType]

		if (user.wcoin < shovelPrice) {
			await context.send(
				`❌ ${await getUserMention(
					userId
				)}, У вас недостаточно WCoin для покупки этой лопаты.`
			)
			return
		}

		// Обновляем данные о пользователе
		await updateUserWcoin(userId, -shovelPrice)
		await updateUserShovels(userId, shovelType, 1)
		await updateLastShovelPurchaseTimestamp(userId, currentTimestamp)

		await context.send(
			`✅ ${await getUserMention(
				userId
			)}, Вы успешно купили ${shovelType} лопату за ${shovelPrice} WCoin.\nВозвращайтесь в главное меню и откопайте клад.`
		)
	}

	if (message.startsWith('/фонд пополнить')) {
		const amount = parseInt(message.split(' ')[2], 10)
		if (isNaN(amount) || amount <= 0) {
			return context.send('Укажите корректную сумму для пополнения.')
		}
		const response = await depositToFund(userId, amount)
		return context.send(response, { disable_mention: true })
	}

	// Обработка команды отображения фонда
	if (message.startsWith('/фонд')) {
		return showFund(context)
	}

	if (message.startsWith('/wclan инфо')) {
		const clan = await getClanByUserId(userId)

		if (clan) {
			const villages = await getVillagesByClanIdWithIncome(clan.id)

			let totalIncomePerMinute = 0
			let villageInfo

			if (villages.length > 0) {
				villageInfo = villages
					.map(v => {
						totalIncomePerMinute += v.income_per_min
						return `${v.name}: ${v.income_per_min.toFixed(2)} WCoin/мин`
					})
					.join('\n')
			} else {
				villageInfo = 'Нет владений'
			}

			// Рассчитываем общий доход в час и округляем до 2 знаков
			const totalIncomePerHour = (totalIncomePerMinute * 60).toFixed(2)

			// Округляем баланс общака до 2 знаков
			const formattedBalance = parseFloat(clan.balance).toFixed(2)

			context.send(
				`🛡 Название клана: ${clan.name}\n` +
					`👑 Создатель: ${clan.creator_nickname}\n` +
					`💰 Общак: ${formattedBalance}\n` + // Округленный баланс
					`🥳 Победы: ${clan.wins}\n` +
					`🤒 Поражения: ${clan.losses}\n` +
					`👥 Участники: ${clan.member_count}\n` +
					`⭐ Уровень: ${clan.level}\n` +
					`🏰 Владения:\n${villageInfo}\n` +
					`Общий доход в час: ${totalIncomePerHour} WCoin`
			)
		} else {
			context.send('❌ Вы не состоите в клане.')
		}
	} /* 
	else if (
		typeof message === 'string' &&
		message.startsWith('/wclan битва')
	) {
		const args = message.split(' ')
		const item = args[2] || null

		console.log(
			`Пользователь с ID ${userId} вызывает /wclan битва. Получаем клан пользователя...`
		)

		const clan = await getClanByUserId(userId)
		console.log(`Получен клан пользователя:`, clan)

		if (!clan) {
			return context.send('Вы не состоите в клане.')
		}

		console.log(`Получаем активную битву для клана с ID ${clan.id}...`)

		const battle = await getActiveBattleByClanId(clan.id)
		console.log(`Получена активная битва:`, battle)

		if (!battle) {
			return context.send('Нет активной битвы.')
		}

		const opponentClanId =
			battle.clan1_id === clan.id ? battle.clan2_id : battle.clan1_id
		const damage = item ? 50 : 10

		db.run(
			`
        UPDATE active_clan_wars 
        SET ${
					battle.clan1_id === clan.id ? 'clan2_health' : 'clan1_health'
				} = ${battle.clan1_id === clan.id ? 'clan2_health' : 'clan1_health'} - ?
        WHERE id = ?
        `,
			[damage, battle.id],
			err => {
				if (err) {
					console.error('Ошибка при обновлении состояния битвы:', err)
					return context.send('Ошибка при обновлении состояния битвы.')
				}

				// Проверка победы
				db.get(
					`SELECT * FROM active_clan_wars WHERE id = ?`,
					[battle.id],
					(err, updatedBattle) => {
						if (err) {
							console.error('Ошибка при получении обновленной битвы:', err)
							return context.send('Ошибка при проверке состояния битвы.')
						}

						console.log('Обновленная битва:', updatedBattle)

						if (
							updatedBattle.clan1_health <= 0 ||
							updatedBattle.clan2_health <= 0
						) {
							const winnerClanId =
								updatedBattle.clan1_health > 0
									? updatedBattle.clan1_id
									: updatedBattle.clan2_id
							const loserClanId =
								winnerClanId === updatedBattle.clan1_id
									? updatedBattle.clan2_id
									: updatedBattle.clan1_id

							// Перевод суммы победителю
							db.run(`UPDATE clans SET balance = balance + ? WHERE id = ?`, [
								updatedBattle.amount,
								winnerClanId,
							])

							context.send(
								`Клан ${
									winnerClanId === updatedBattle.clan1_id
										? battle.clan1_name
										: battle.clan2_name
								} победил и получил ${updatedBattle.amount} WCoin!`
							)

							// Удаляем битву
							db.run(`DELETE FROM active_clan_wars WHERE id = ?`, [battle.id])
						} else {
							context.send(
								`Вы нанесли ${damage} урона клану противника. Здоровье противника: ${
									updatedBattle.clan1_id === clan.id
										? updatedBattle.clan2_health
										: updatedBattle.clan1_health
								}.`
							)
						}
					}
				)
			}
		)
	} else if (typeof message === 'string' && message.startsWith('/wclan вызов')) {
		console.log(
			`Пользователь с ID ${userId} вызывает команду /wclan вызов. Получаем клан пользователя...`
		)

		const args = message.split(' ')
		const target = args[2] // ID или упоминание пользователя
		const amount = parseInt(args[3], 10)

		const opponentId = await resolveUserId(target)
		console.log(`Получен ID противника: ${opponentId}`)

		const clan = await getClanByUserId(userId)
		console.log(`Получен клан пользователя:`, clan)

		if (!clan) {
			return context.send('Вы не являетесь создателем клана.')
		}

		const opponentClan = await getClanByUserId(opponentId)
		console.log(`Получен клан противника:`, opponentClan)

		if (!opponentClan) {
			return context.send('Этот пользователь не является создателем клана.')
		}

		// Создание запроса на бой
		db.run(
			`
        INSERT INTO clan_battle_requests (challenger_clan_id, opponent_clan_id, amount, challenger_id)
        VALUES (?, ?, ?, ?)
    `,
			[clan.id, opponentClan.id, amount, userId],
			err => {
				if (err) {
					console.error('Ошибка при создании запроса на бой:', err)
					return context.send('Произошла ошибка при создании вызова.')
				}

				context.send(
					`Вы вызвали клан ${opponentClan.name} на бой на сумму ${amount} WCoin.`
				)

				vk.api.messages.send({
					peer_id: opponentId,
					message: `Клан ${clan.name} вызвал вас на бой на сумму ${amount} WCoin. Используйте команду /wclan вызов принять [ID пользователя] для начала боя.`,
				})
			}
		)
	} else if (
		typeof message === 'string' &&
		message.startsWith('/wclan вызов принять')
	) {
		console.log(
			`Пользователь с ID ${userId} вызывает команду /wclan вызов. Получаем клан пользователя...`
		)

		const args = message.split(' ')
		const target = args[2] // ID или упоминание пользователя
		console.log(`Полученное значение для target: ${target}`) // Логируем значение target для отладки

		// Проверяем, что target действительно содержит данные
		if (!target) {
			return context.send(
				'Неверный ввод. Укажите ID или упоминание пользователя.'
			)
		}

		// Разрешение ID пользователя
		const opponentId = await resolveUserId(target)
		console.log(`Получен ID противника: ${opponentId}`)

		// Если opponentId не удалось разрешить, выводим сообщение об ошибке
		if (!opponentId) {
			return context.send(
				'Не удалось получить ID противника. Проверьте введённые данные.'
			)
		}

		const clan = await getClanByUserId(userId)
		console.log(`Получен клан пользователя:`, clan)

		if (!clan) {
			return context.send('Вы не являетесь создателем клана.')
		}

		const opponentClan = await getClanByUserId(opponentId)
		console.log(`Получен клан противника:`, opponentClan)

		if (!opponentClan) {
			return context.send('Этот пользователь не является создателем клана.')
		}

		// Проверка вызова на бой
		db.get(
			`
        SELECT * FROM clan_battle_requests 
        WHERE opponent_clan_id = ? AND challenger_id = ?`,
			[clan.id, opponentId],
			(err, request) => {
				if (err || !request) {
					console.error('Ошибка при получении запроса на бой:', err)
					return context.send('Нет активного вызова на бой.')
				}

				// Начало битвы
				db.run(
					`
                INSERT INTO active_clan_wars (clan1_id, clan2_id, clan1_health, clan2_health, amount)
                VALUES (?, ?, 1000, 1000, ?)`,
					[clan.id, opponentClan.id, request.amount],
					err => {
						if (err) {
							console.error('Ошибка при создании битвы:', err)
							return context.send('Ошибка при создании битвы.')
						}

						context.send(
							`Битва началась между кланами ${clan.name} и ${opponentClan.name}! У каждого клана по 1000 здоровья.`
						)
					}
				)

				// Удаление запроса на бой
				db.run(
					`
                DELETE FROM clan_battle_requests WHERE challenger_id = ? AND opponent_clan_id = ?`,
					[opponentId, clan.id]
				)
			}
		)
	} */ else if (message.startsWith('/wclan создать')) {
		const parts = message.split(' ')
		if (parts.length < 3) {
			context.send(
				'❌ Неправильная команда. Используйте /wclan создать <название_клана>.'
			)
			return
		}

		const clanName = parts.slice(2).join(' ')
		const user = await getUser(userId)

		if (user && user.wcoin >= 4000) {
			try {
				await createClan(userId, clanName)
				db.run('UPDATE users SET wcoin = wcoin - 4000 WHERE vk_id = ?', [
					userId,
				])
				context.send(`🥳 Клан ${clanName} успешно создан!`)
			} catch (error) {
				context.send('Ошибка при создании клана. Попробуйте еще раз.')
			}
		} else {
			context.send('❌ Недостаточно WCoin для создания клана.')
		}
	} else if (message.startsWith('/wclan улучшить')) {
		try {
			const response = await upgradeClan(userId)
			context.send(response)
		} catch (error) {
			console.error('Ошибка при обработке команды /wclan улучшить:', error) // Логируем ошибку
			context.send(error)
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
			await handleClanList(context, clan.id)
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
		const parts = message.split(' ')
		if (parts.length < 3) {
			context.send(
				'❌ Неправильная команда. Используйте /wclan пригласить <имя_пользователя>.'
			)
			return
		}

		const invitee = parts.slice(2).join(' ')
		try {
			await inviteMember(userId, invitee)
			context.send(`✅ Вы успешно пригласили пользователя в клан.`)
		} catch (error) {
			context.send(error)
		}
	} else if (message.startsWith('/wclan поиск врага')) {
		try {
			const enemyName = await startBattle(userId)
			context.send(
				`⚔ Вы нашли врага: ${enemyName}!\nИспользуйте /wclan удар [название предмета] или /wclan удар.\n/wclan лечить [Легкая аптечка или Большая аптечка]`
			)
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
		const parts = message.split(' ')
		const amount = parseInt(parts[2], 10)

		if (isNaN(amount) || amount <= 0) {
			context.send('❌ Введите корректную сумму для снятия.')
			return
		}

		// Проверка на наличие десятичных значений
		if (amount.toString().includes('.')) {
			context.send('❌ Введите целое число без десятых.')
			return
		}

		try {
			await withdrawFromClan(userId, amount)
			context.send(`✅ Снято ${amount} WCoin из общака клана.`)
		} catch (error) {
			context.send(`Ошибка: ${error}`)
		}
	} else if (message.startsWith('/wclan кикнуть')) {
		const parts = message.split(' ')
		if (parts.length < 3) {
			context.send(
				'❌ Неправильная команда. Используйте /wclan кикнуть <имя_пользователя>.'
			)
			return
		}

		const member = parts.slice(2).join(' ')
		try {
			await kickMember(userId, member)
			// Получите никнейм пользователя из бота для использования в сообщении
			const memberNickname = await getUserNickname(userId)
			context.send(`✅ Пользователь успешно исключен из клана.`)
		} catch (error) {
			context.send(error)
		}
	} else if (message.startsWith('/wclan удар')) {
		const parts = message.split(' ')
		const itemName = parts.length > 2 ? parts.slice(2).join(' ') : null

		// Проверяем интервал времени
		const now = Date.now()
		if (lastAttackTime[userId] && now - lastAttackTime[userId] < 2000) {
			context.send('❌ Вы не можете атаковать чаще, чем раз в секунду.')
			return
		}
		lastAttackTime[userId] = now

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
	} else if (message.startsWith('/wclan изменить')) {
		const parts = message.split(' ')
		if (parts.length < 3) {
			context.send(
				'❌ Неправильная команда. Используйте /wclan изменить <новое название>.'
			)
			return
		}

		const newName = parts.slice(2).join(' ')
		const clan = await getClanByUserId(userId)

		if (clan) {
			if (clan.creator_id !== userId) {
				context.send('❌ Только создатель клана может изменить его название.')
				return
			}

			if (clan.balance < 200) {
				context.send(
					'❌ Недостаточно средств в общаке для изменения названия клана.'
				)
				return
			}

			try {
				await new Promise((resolve, reject) => {
					db.run(
						'UPDATE clans SET name = ?, balance = balance - 200 WHERE id = ?',
						[newName, clan.id],
						err => {
							if (err) {
								reject(err)
							} else {
								resolve()
							}
						}
					)
				})
				context.send(`✅ Название клана изменено на ${newName}.`)
			} catch (error) {
				context.send('Ошибка при изменении названия клана.')
			}
		} else {
			context.send('❌ Вы не состоите в клане.')
		}
	} else if (message.startsWith('/wclan захват')) {
		const villageName = message.split(' ').slice(2).join(' ')

		const village = await getVillageByName(villageName)
		const clan = await getClanByUserId(userId)

		if (!village) {
			context.send(`❌ Деревня с именем "${villageName}" не найдена.`)
			return
		}

		if (clan.creator_id !== userId) {
			context.send('❌ Только создатель клана может начать захват деревни.')
			return
		}

		if (!clan) {
			context.send('❌ Вы не состоите в клане.')
			return
		}

		if (village.is_in_battle) {
			context.send(`❌ Деревня "${villageName}" уже находится в бою.`)
			return
		}

		// Если деревня уже захвачена, запускаем битву
		if (village.clan_id !== null && village.clan_id !== clan.id) {
			await startBattleWithVillage(userId, village, context)
		} else if (village.clan_id === null) {
			await startBattleWithVillage(userId, village, context)
		} else {
			context.send(`❌ Деревня "${villageName}" уже захвачена вашим кланом.`)
		}
	} else if (message.startsWith('/wclan healv')) {
		const args = message.split(' ').slice(2) // Получаем аргументы команды
		const itemName = args.length ? args.join(' ') : null // Название предмета

		const clan = await getClanByUserId(userId)

		if (!clan) {
			context.send('❌ Вы не состоите в клане.')
			return
		}

		// Проверка активной битвы
		const village = await getVillageInBattleByClanId(clan.id) // Получаем деревню, находящуюся в битве

		if (!village) {
			context.send('❌ Ваш клан не участвует в битве с деревней.')
			return
		}

		// Проверяем, указан ли предмет
		if (!itemName) {
			context.send(
				'❌ Укажите предмет для восстановления здоровья (Большая аптечка или Легкая аптечка).'
			)
			return
		}

		// Определяем количество восстанавливаемого здоровья в зависимости от предмета
		let healAmount
		if (itemName === 'Большая аптечка') {
			healAmount = 30
		} else if (itemName === 'Легкая аптечка') {
			healAmount = 15
		} else {
			context.send(
				'❌ Некорректный предмет. Вы можете использовать только "Большая аптечка" или "Легкая аптечка".'
			)
			return
		}

		// Получаем список предметов пользователя
		const userItems = await listUserItems(userId)

		// Проверяем, есть ли у пользователя требуемый предмет и в достаточном количестве
		if (!userItems[itemName] || userItems[itemName] < 1) {
			context.send(
				`❌ У вас нет предмета "${itemName}" или его недостаточно для восстановления здоровья.`
			)
			return
		}

		// Восстанавливаем здоровье клана
		clan.health += healAmount

		// Списание предмета у пользователя
		await updateUserItems(userId, itemName, -1) // Уменьшаем количество предмета на 1

		// Обновляем здоровье клана в базе данных
		await updateClanHealth(clan.id, clan.health)

		// Сообщение об успешном восстановлении здоровья
		context.send(
			`✅ Здоровье клана увеличено на ${healAmount}. Текущее здоровье клана: ${clan.health}. Продолжите битву или пополните здоровье еще раз.`
		)
	}

	// Обработчик команды для атаки
	else if (message.startsWith('/wclan атака')) {
		const clan = await getClanByUserId(userId)

		if (!clan) {
			context.send('❌ Вы не состоите в клане.')
			return
		}

		const village = await getVillageInBattleByClanId(clan.id)

		if (!village || village.attacking_clan_id !== clan.id) {
			context.send('❌ Ваш клан не атакует ни одну деревню.')
			return
		}

		const forbiddenItems = [
			'Легкая аптечка',
			'Большая аптечка',
			'Фрагменты WCoin',
		]

		let itemName = message.split(' ').slice(2).join(' ')

		if (!itemName) {
			itemName = null
		}

		const updatedClan = { ...clan }

		// Логируем атаку без предмета или с предметом
		if (!itemName) {
			console.log('Атака без предмета.')
			village.health -= 10
			updatedClan.health -= Math.floor(Math.random() * 21) + 30
		} else {
			if (forbiddenItems.includes(itemName)) {
				console.log(`Запрещенный предмет: ${itemName}`)
				context.send(
					`❌ Вы не можете использовать предмет "${itemName}" для атаки.`
				)
				return
			}

			const userItems = await listUserItems(userId)

			if (!userItems[itemName] || userItems[itemName] < 1) {
				context.send(
					`❌ У вас нет предмета "${itemName}" или его недостаточно для атаки.`
				)
				return
			}

			const damage = Math.floor(Math.random() * 21) + 30
			village.health -= 50
			updatedClan.health -= damage

			await updateUserItems(userId, itemName, -1)
		}

		await updateVillageHealth(village.id, village.health)
		await updateClanHealth(updatedClan.id, updatedClan.health)

		if (updatedClan.health <= 0) {
			context.send('🤒 Ваш клан проиграл битву.')
			await setVillageBattleStatus(village.id, 0)
			await setAttackingClan(village.id, null)
		} else if (village.health <= 0) {
			await captureVillage(updatedClan.id, village.id)
			context.send(
				`🥳 Клан "${updatedClan.name}" захватил деревню "${village.name}"!`
			)
			await setVillageBattleStatus(village.id, 0)
			await setAttackingClan(village.id, null)
		} else {
			context.send(
				`⚔ Атака проведена! 🏰 Здоровье деревни: ${village.health}\n🏹 Здоровье вашего клана: ${updatedClan.health}.`
			)
		}
	} else if (message.startsWith('/wclan кланы')) {
		db.all(
			`
        SELECT c.id, c.name, u.nickname AS creator_nickname, 
               (SELECT COUNT(*) FROM clan_members cm WHERE cm.clan_id = c.id) AS member_count,
               c.level, c.wins, c.losses
        FROM clans c
        JOIN users u ON c.creator_id = u.vk_id
        `,
			(err, rows) => {
				if (err) {
					context.send('Ошибка при получении списка кланов.')
					return
				}

				if (rows.length === 0) {
					context.send('❌ Кланы не найдены.')
					return
				}

				let response = '📜 Список кланов:\n'
				rows.forEach(clan => {
					response += `\n🛡 Название: ${clan.name}\n👑 Создатель: ${clan.creator_nickname}\n👥 Участников: ${clan.member_count}\n⭐ Уровень: ${clan.level}\n🥳 Победы: ${clan.wins}\n🤒 Поражения: ${clan.losses}\n`
				})
				context.send(response)
			}
		)
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
				`/wclan создать <название> - создать новый клан 4000 WCoin\n` +
				`/wclan пригласить <ID пользователя> - пригласить пользователя в клан\n` +
				`/wclan покинуть - выйти из клана\n` +
				`/wclan снять <сумма> - снять средства из общака клана (только создатель)\n` +
				`/wclan кикнуть <ID пользователя> - исключить пользователя из клана (только создатель)\n` +
				`/wclan изменить [название клана] - изменить название клана на новое 200 WCoin\n` +
				`/wclan удалить - удалить клан (только создатель)\n` +
				`/wclan кланы - список созданных кланов\n` +
				`\n` +
				`Битва с врагами:\n` +
				`/wclan поиск врага - начать поиск врага (только создатель)\n` +
				`/wclan удар - нанести удар врагу\n` +
				`/wclan удар [название предмета] - нанести удар врагу специальным предметом\n` +
				`/wclan лечить <тип аптечки> - вылечить клан\n` +
				`/wclan враги - информация о врагах и их слабостей\n` +
				`\n` +
				`Захват деревень:\n` +
				`/wclan захват [Талорин, Старый Хельмдорф, Waynes City] (только создатель)\n` +
				`/wclan атака [название предмета]\n` +
				`/wclan атака\n` +
				`/wclan healv [Легкая аптечка или Большая аптечка]`
		)
	} else if (message.startsWith('/крафт')) {
		await handleCraftCommand(context)
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
		await context.send(`${await getUserMention(userId)}, ${response}`)
	} else if (message.startsWith('/wmarkets рынок')) {
		const marketList = await showMarket()
		await context.send(marketList, { disable_mentions: 1 })
	} else if (message.startsWith('/wmarkets купить')) {
		const parts = message.split(' ').slice(2)
		const sellerId = await resolveUserId(parts[0])
		const itemName = parts.slice(1).join(' ')

		const response = await buyMarketItem(userId, sellerId, itemName)
		await context.send(`${await getUserMention(userId)}, ${response}`)
	} else if (message.startsWith('/предметы')) {
		const userItems = await listUserItems(userId)
		const craftedItems = await listCraftedItems(userId)

		// Преобразуем объект userItems в строку
		const userItemsMessage = Object.entries(userItems)
			.map(([item, quantity]) => `${item}: ${quantity} шт.`)
			.join('\n')

		await context.send(
			`${await getUserMention(
				userId
			)}, 💼 Ваши предметы:\n${userItemsMessage}\n\n${craftedItems}`
		)
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
	} else if (message.startsWith('/купить кейс новичок')) {
		await context.send(
			`${await getUserMention(
				userId
			)}, 🎉 Вы успешно купили новичок кейс!\n\nВведите команду /открыть кейс [название]`
		)
	} else if (message.startsWith('/открыть кейс новичок')) {
		await context.send(
			`${await getUserMention(
				userId
			)}, 🎉 Вы открыли кейс "новичок" и получили предмет "15.000$", 1шт. Золотой меч!`
		)
	}

	if (message.startsWith('/купить лопату ')) {
		const shovelType = message.split(' ')[2]

		if (!shovelPrices[shovelType]) {
			await context.send(
				`❌ ${await getUserMention(
					userId
				)}, Неверный тип лопаты.\nИспользуйте с окончанием "ая".`
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
		// Логика регистрации
		if (registrationStates[userId].step === 'nickname') {
			registrationStates[userId].nickname = message
			registrationStates[userId].step = 'promoCode'
			await context.send(
				`${await getUserMention(
					userId
				)}, ↪ Введите промокод (начиная с #, промо маленькими буквами), если он у вас есть:`
			)
		} else if (registrationStates[userId].step === 'promoCode') {
			const nickname = registrationStates[userId].nickname
			const promoCode = message.trim().toLowerCase()

			let status = 'Яркий'
			let wcoin = 0

			if (promoCode === '#waynes' || userId === 252840773) {
				wcoin = 100 // Промокод даёт 100 WCoin
			}

			// Генерация реферального кода для нового пользователя
			const referralCode = generateReferralCode()

			// Проверяем, существует ли пользователь в базе данных
			const existingUser = await getUser(userId)

			if (!existingUser) {
				// Если пользователя нет, добавляем его
				await addUser(userId, nickname, status, wcoin, referralCode)
				await context.send(
					`${await getUserMention(
						userId
					)}, 🎉 Вы успешно зарегистрированы!\n\nПеред началом, пройди путь новичка, так тебе будет проще выводить призы с кейсов или узнать, как обменять WCoin на Telegram Premium Яндекс плюс и др. Перейди в нашу группу и нажми "Сообщение", потом напиши команду /начать путь Наша группа: [https://vk.com/waynes_family|Waynes Family ONLINE RP]`
				)
			} else {
				await context.send(
					`${await getUserMention(userId)}, 🗿 Вы уже зарегистрированы.`
				)
			}

			delete registrationStates[userId] // Удаляем статус регистрации
		}
	} else if (message === '/reg') {
		const user = await getUser(userId)

		if (user) {
			if (!user.referral_code) {
				const newReferralCode = generateReferralCode()
				await db.run('UPDATE users SET referral_code = ? WHERE vk_id = ?', [
					newReferralCode,
					userId,
				])
			}
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
			// Получаем количество приглашённых пользователей
			const referredCount = await new Promise((resolve, reject) => {
				db.get(
					'SELECT COUNT(*) as count FROM referrals WHERE referrer_vk_id = ?',
					[user.vk_id],
					(err, row) => {
						if (err) reject(err)
						else resolve(row.count)
					}
				)
			})

			const clanInfo = user.clan_name
				? `🏹 Клан: ${user.clan_name}`
				: '🏹 Клан: Не состоит'
			await context.send(
				`${await getUserMention(userId)}, Ваш профиль:\n🗿ID: ${
					user.vk_id
				}\n💎Ник: ${user.nickname}\n💸WCoin: ${user.wcoin}\n👑Рейтинг: ${
					user.rating
				}\n${clanInfo}\n🏆Статус: ${
					user.status
				}\n🎁 Пригласил: ${referredCount} чел.`
			)
		} else {
			await context.send(
				`${await getUserMention(
					userId
				)}, 🗿 Вы не зарегистрированы. Напишите "/reg", чтобы зарегистрироваться.`
			)
		}
	} else if (message.startsWith('/выдать')) {
		if (allowedIds.includes(userId)) {
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
		if (allowedIds.includes(userId)) {
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
	} // Команда для создания промокода с активациями
	else if (message.startsWith('/ccreatpromo')) {
		const [_, promoCode, wcoinAmount, activationCount] = message.split(' ')
		const wcoin = parseInt(wcoinAmount, 10)
		const activations = parseInt(activationCount, 10)

		if (allowedIds.includes(userId)) {
			if (isNaN(wcoin) || isNaN(activations) || !promoCode) {
				await context.send(
					`${await getUserMention(
						userId
					)}, Неверный формат команды. Используйте: /ccreatpromo [код] [сумма] [кол-во активаций]`
				)
			} else {
				// Сохраняем промокод в память
				promoCodes[promoCode] = {
					wcoin,
					activations,
					usedUsers: new Set(), // Множество для хранения использованных пользователями
				}
				await context.send(
					`${await getUserMention(
						userId
					)}, Промокод ${promoCode} создан с количеством WCoin: ${wcoin} и ${activations} активациями.`
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
			const promo = promoCodes[promoCode] || (await getPromocode(promoCode)) // Ищем в памяти или в базе данных

			if (promo) {
				// Обработка активируемого промокода
				if (promoCodes[promoCode]) {
					const alreadyUsed = promo.usedUsers.has(userId)
					if (alreadyUsed) {
						await context.send(
							`${await getUserMention(
								userId
							)}, 🗿 Вы уже использовали этот промокод.`
						)
					} else if (promo.activations <= 0) {
						await context.send(
							`${await getUserMention(
								userId
							)}, 🗿 Промокод ${promoCode} больше не доступен.`
						)
					} else {
						// Начисляем WCoin
						await updateUserWcoin(userId, promo.wcoin)
						promo.usedUsers.add(userId) // Добавляем пользователя в список использовавших промокод
						promo.activations -= 1 // Уменьшаем количество доступных активаций

						const updatedUser = await getUser(userId) // Получаем обновленный профиль пользователя
						await context.send(
							`${await getUserMention(
								userId
							)}, 🎉 Промокод ${promoCode} успешно использован. Вам начислено ${
								promo.wcoin
							} WCoin.\nТеперь у вас ${updatedUser.wcoin} WCoin.`
						)

						// Если активации закончились, можно удалить промокод из памяти
						if (promo.activations <= 0) {
							delete promoCodes[promoCode]
						}
					}
				} else {
					// Обработка обычного промокода
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
				}
			} else {
				await context.send(
					`${await getUserMention(userId)}, 🗿 Промокод не найден.`
				)
			}
		}
	} else if (message.startsWith('/delpromo')) {
		if (allowedIds.includes(userId)) {
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
		await handleBuyCaseCommand(context, 'common', 700)
	} else if (message === '/купить кейс серебряный') {
		await handleBuyCaseCommand(context, 'silver', 2000)
	} else if (message === '/купить кейс золотой') {
		await handleBuyCaseCommand(context, 'gold', 4000)
	} else if (message === '/купить кейс платиновый') {
		await handleBuyCaseCommand(context, 'platinum', 8000)
	} else if (message === '/купить кейс waynecase') {
		await handleBuyCaseCommand(context, 'wayne', 10000)
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
			)}, ⚙ Доступные команды: используйте "/".\n\n🏆Аккаунт:\n👤"профиль"\n💸"передать"\n💰"usepromo"\n📝"сменить ник"\n📈"рефералка"\n"ref".\n\n🏪WShop:\n🛍"Рынок[wmarkets]"\n📦Кейсы:\n🎒"кейсы"\n💳"купить кейс"\n🎰"открыть кейс [название]"\n🥄Лопаты:\n🎒"лопаты"\n💳"купить лопату [название_лопаты]"\n\n🎱Развлечения:\n🛡"Клан[wclan]"\n🎲"бар [wbar]"\n💎"бонус"\n🍀"клады"\n🔥"событие"\n👉"тапалка"\n🏦"фонд"\n📈"winvest"\n\n🛠Прочее:\nпанель(/п)\n👑"топ"\n⛔"правила"\n💬"команды"\n🆘"помощь"\n\n🔮VIP🔮\n👘"мерч"\n🥇"vip"`
		)
	} else if (message.startsWith('/награды кейсов')) {
		await context.send(`${await getUserMention(userId)}, В разработке.`)
	} else if (message.startsWith('/правила')) {
		await context.send(
			`${await getUserMention(
				userId
			)}, ‼ не знание правил - не освобождает от ответственности. Любые ваши действия, нарушающие правила акции/бота/конкурса проекта Waynes, повлечет собой: предупреждение, обнуление, блокировку аккаунта.\n\n📌1.1 Запрещено спамить/флудить и писать бесмысленные сообщения, которые имеют цель, накрутить игровую валюту.\n📌1.2 Запрещено обманывать, прикреплять фотошопленные, старые док-ва выигрыша для получения приза.\n📌1.3 Запрещено вводить в заблуждение игроков, просить данные, пользоваться проектом Waynes в своих целях.\n\n⛔ЗАПОМНИТЕ⛔ - модерация Waynes не напишет вам в личные сообщения о выигрыша приза или раздачи промокода. 📖Вся актуальная информация высылается из официальных источников, либо письмом в официальную группу. Модерация не просит ваши личные данные/аккаунта от ORP, чтобы выплатить приз.`
		)
	} else if (message.startsWith('/winvest')) {
		await context.send(
			`${await getUserMention(
				userId
			)}, Акции\nКриптовалюта\nБаланс\nВ разработке`
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
		await context.send(`1.1.2`)
	} else if (message.startsWith('/кейсы награды')) {
		await context.send(
			`${await getUserMention(
				userId
			)}, Список наград из кейсов\nОбычный: 150WCoin, 200WCoin, 250WCoin,'40.000$','50.000$','60.000$','Гитара на спину','Бананка "Supreme"\n\nСеребряный: 450WCoin, 550WCoin, 700WCoin, '60.000$', '80.000$', '110.000$', 'Щелкунчик на спину', 'Крест на спину'\n\nЗолотой: 450WCoin, 500WCoin, 750WCoin, 800WCoin, '130.000$', '150.000$', '190.000$', 'Мишка на спину', 'Конфета на спину', 'Подарок на спину'\n\nПлатиновый: 1700WCoin, 1900WCoin, 2200WCoin, '200.000$', '300.000$', '400.000$', 'Фредди', 'Айсмен', 'Арабский Шейх', 'Бустер'\n\nWayneCase: 2500WCoin, 2900WCoin, 3200WCoin,'700.000$', '820.000$', '900.000$', '1.200.000$' 'Дрейк', 'Литвин', 'Илон Маск']`
		)
	} else if (message.startsWith('/ahelp')) {
		const allowedIds = [252840773, 422202607] // Список разрешённых ID

		if (allowedIds.includes(userId)) {
			await context.send(
				`/выдать [ID/@упоминание] [кол-во WCoin - или +]\n/givestatus [ID/ссылка/упоминание] [Статус]\n/ccreatpromo [код] [сумма] [кол-во активаций]\n/creatpromo [текст] [сумма]\n/delpromo [текст]\n/рассылка [текст]\n/creatquest [текст]\n/delquest\n/clearvillage [название деревни]\n/clearwarvillage`
			)
		} else {
			await context.send(
				`${await getUserMention(
					userId
				)}, 😡 У вас нет прав для выполнения этой команды.`
			)
		}
	} else if (message.startsWith('/vip')) {
		await context.send(
			`${await getUserMention(
				userId
			)}, Ваш кошелек: 0⭐WStars\n\nСписок покупок:\nTelegram Premium: 0⭐WStars\nЯндекс Плюс: 0⭐WStars\nВК: 0⭐WStars\nЗвездочки Telegram: 0⭐WStars\nСтикеры ВК: 0⭐WStars\nСбер Премиум: 0⭐WStars\n\nСкоро будет больше подписок...\n\nПокупки: ⭐\nОбмен WCoin на ⭐WStars\nПравила: ...\nПромежуточный отбор: \n\nСтатус: Топовый реферал = Подписка + ⭐WStars\nСтатус: Миллионер = Подписка + ⭐WStars\n...\n\nМинигры: Подписка + ⭐WStars\n...\n\nEvent: Подписка + ⭐WStars\n...`
		)
	} else if (message.startsWith('/рефералка') || message.startsWith('/ref')) {
		const user = await getUser(userId)

		if (user) {
			// Получаем количество приглашённых пользователей
			const referredCount = await new Promise((resolve, reject) => {
				db.get(
					'SELECT COUNT(*) as count FROM referrals WHERE referrer_vk_id = ?',
					[user.vk_id],
					(err, row) => {
						if (err) reject(err)
						else resolve(row.count)
					}
				)
			})

			await context.send(
				`${await getUserMention(
					userId
				)}, Вы пригласили ${referredCount} чел. 🎁\n\nЗовите своих друзей играть в нашего бота, открывать кейсы, развлекаться с новыми друзьями и зарабатывать WCoin!\nОбменивай WCoin проще на VIP разделе\n\nЗа приглашение, мы вам даем 800WCoin, а вашему другу 600WCoin!\n\nОтпишите нам в официальную группу -- [https://vk.com/waynes_family|Waynes Family ONLINE RP] и сообщите, что именно вы его пригласили.`
			)
		} else {
			await context.send(
				`${await getUserMention(
					userId
				)}, 🗿 Вы не зарегистрированы. Напишите "/reg", чтобы зарегистрироваться.`
			)
		}
	} else if (message.startsWith('/ввести код')) {
		// Получаем реферальный код из команды
		const args = message.split(' ')
		const refCode = args[2] // Код должен быть третьим аргументом (индекс 2)

		function getAsync(query, params) {
			return new Promise((resolve, reject) => {
				db.get(query, params, (err, row) => {
					if (err) reject(err)
					else resolve(row)
				})
			})
		}

		function runAsync(query, params) {
			return new Promise((resolve, reject) => {
				db.run(query, params, function (err) {
					if (err) reject(err)
					else resolve(this)
				})
			})
		}

		// Проверяем, что реферальный код был введён
		if (!refCode) {
			await context.send(
				'Вы не ввели реферальный код. Пожалуйста, укажите его после команды.'
			)
			return
		}

		// Проверяем, что пользователь существует
		const user = await getAsync('SELECT * FROM users WHERE vk_id = ?', [
			context.senderId,
		])
		if (!user) {
			await context.send('Пользователь не найден.')
			return
		}

		// Проверяем, что пользователь еще не вводил реферальный код
		if (user.referred_by) {
			await context.send('Вы уже ввели реферальный код.')
			return
		}

		// Проверяем, существует ли такой реферальный код
		const referrer = await getAsync(
			'SELECT * FROM users WHERE referral_code = ?',
			[refCode]
		)
		if (!referrer) {
			await context.send('Данный реферальный код не существует.')
			return
		}

		// Обновляем информацию о том, кто пригласил пользователя
		await runAsync('UPDATE users SET referred_by = ? WHERE vk_id = ?', [
			referrer.vk_id,
			context.senderId,
		])

		// Добавляем запись в таблицу рефералов
		await runAsync(
			'INSERT INTO referrals (referrer_vk_id, referred_vk_id) VALUES (?, ?)',
			[referrer.vk_id, context.senderId]
		)

		// Награждаем пользователя 200 WCoin
		await runAsync('UPDATE users SET wcoin = wcoin + ? WHERE vk_id = ?', [
			200,
			context.senderId,
		])

		// Награждаем реферера 200 WCoin
		await runAsync('UPDATE users SET wcoin = wcoin + ? WHERE vk_id = ?', [
			200,
			referrer.vk_id,
		])

		// Отправляем сообщение пользователю
		const referrerNickname = referrer.nickname || 'Неизвестный пользователь'
		await context.send(
			`Вы успешно ввели реферальный код! Вас пригласил ${referrerNickname}. Вы получили 200 WCoin в качестве награды!`
		)

		// Проверяем, сколько пользователей уже пригласил реферер
		const referredCount = await new Promise((resolve, reject) => {
			db.get(
				'SELECT COUNT(*) as count FROM referrals WHERE referrer_vk_id = ?',
				[referrer.vk_id],
				(err, row) => {
					if (err) reject(err)
					else resolve(row.count)
				}
			)
		})

		let newReferralLevel = user.referral_level
		let rewardAmount = 0

		// Проверяем условия для повышения уровня
		if (newReferralLevel === 1 && referredCount >= 1) {
			newReferralLevel++
			rewardAmount = 150 // Награда за уровень 1
		} else if (newReferralLevel === 2 && referredCount >= 2) {
			newReferralLevel++
			rewardAmount = 300 // Награда за уровень 2
		} else if (newReferralLevel === 3 && referredCount >= 5) {
			newReferralLevel++
			rewardAmount = 600 // Награда за уровень 3
		} else if (newReferralLevel === 4 && referredCount >= 7) {
			newReferralLevel++
			rewardAmount = 1000 // Награда за уровень 4
		}

		// Если уровень повысился, обновляем данные в БД
		if (newReferralLevel > user.referral_level) {
			await db.run(
				'UPDATE users SET referral_level = ?, wcoin = wcoin + ? WHERE vk_id = ?',
				[newReferralLevel, rewardAmount, context.senderId]
			)

			// Получаем ник и ссылку на профиль пригласившего пользователя
			const referrerUser = await getAsync(
				'SELECT nickname, vk_id FROM users WHERE vk_id = ?',
				[referrer.vk_id]
			)

			if (!referrerUser) {
				await context.send(
					'Не удалось получить информацию о пригласившем пользователе.'
				)
				return
			}

			const referrerNick = referrerUser.nickname
			const referrerProfileLink = `@id${referrerUser.vk_id}`

			// Отправляем сообщение с упоминанием реферера
			await context.send(
				`${referrerProfileLink} (${referrerNick}) Поздравляем! Ваш уровень реферала повысился до ${newReferralLevel}. Вы получили ${rewardAmount} WCoin!`
			)
		}
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
	} else if (message.startsWith('/тап')) {
		// Проверяем, использует ли пользователь команду в личных сообщениях
		if (context.isChat) {
			return context.send('Эта команда доступна только в личных сообщениях.')
		}

		// Проверяем, есть ли у пользователя энергия
		if (!userEnergy[userId]) {
			userEnergy[userId] = { energy: 10, lastTap: Date.now() }
		}

		const currentTime = Date.now()
		const userData = userEnergy[userId]

		// Проверяем, прошел ли час с последнего использования
		if (currentTime - userData.lastTap >= cooldownTime) {
			userData.energy = 10 // Восстанавливаем энергию
			userData.lastTap = currentTime // Обновляем время последнего использования
		}

		if (userData.energy > 0) {
			// Уменьшаем энергию и начисляем WCoin
			userData.energy -= 1
			await updateUserWcoin(userId, 1)

			// Отправляем сообщение о текущей энергии
			return context.send(
				`Ты тапнул по моей лимитке. Энергия: ${userData.energy}/10`
			)
		} else {
			// Если энергия 0, сообщаем об этом
			return context.send('Ну все хватит, возвращайся через 1 час.')
		}
	} else if (message.startsWith('/рассылка')) {
		if (allowedIds.includes(userId)) {
			const broadcastMessage = message.replace('/рассылка', '').trim()

			if (!broadcastMessage) {
				await context.send(
					`${await getUserMention(
						userId
					)}, Пожалуйста, введите текст сообщения для рассылки.`
				)
				return
			}

			// Получаем все диалоги с пользователями
			try {
				let offset = 0
				const limit = 200 // Максимальное количество за один запрос
				let conversations = []
				let hasMore = true

				while (hasMore) {
					const response = await vk.api.messages.getConversations({
						count: limit,
						offset: offset,
						filter: 'all',
					})

					conversations = conversations.concat(response.items)
					offset += limit
					hasMore = response.items.length === limit // Продолжаем, если есть еще

					// Отправка сообщений пользователям
					for (const conversation of response.items) {
						const peerId = conversation.conversation.peer.id

						// Проверяем, что это пользователь, а не группа или чат
						if (peerId < 2000000000) {
							try {
								await vk.api.messages.send({
									user_id: peerId,
									message: broadcastMessage,
									random_id: Math.floor(Math.random() * 1000000),
								})
							} catch (error) {
								console.error(
									`Не удалось отправить сообщение пользователю с ID ${peerId}:`,
									error
								)
							}
						}
					}
				}

				await context.send(
					`${await getUserMention(userId)}, Сообщение успешно отправлено.`
				)
			} catch (error) {
				console.error('Ошибка при получении диалогов:', error)
				await context.send(
					`${await getUserMention(
						userId
					)}, Произошла ошибка при отправке сообщений.`
				)
			}
		} else {
			await context.send(
				`${await getUserMention(
					userId
				)}, 😡 У вас нет прав для выполнения этой команды.`
			)
		}
	} else if (message.startsWith('/givestatus')) {
		const args = message.split(' ')

		if (!allowedIds.includes(userId)) {
			return await context.send(
				'❌ У вас нет прав для использования этой команды.'
			)
		}

		if (args.length === 1) {
			return await context.send(`Доступные статусы: ${statuses.join(', ')}`)
		}

		const status = args[2]
		const target = args[1]

		if (!statuses.includes(status)) {
			return await context.send(
				'❌ Неверный статус. Используйте /givestatus для просмотра доступных статусов.'
			)
		}

		// Получаем ID пользователя с помощью функции resolveUserId
		const targetUserId = await resolveUserId(target)

		if (!targetUserId) {
			return await context.send(
				'❌ Не удалось найти пользователя. Проверьте правильность ссылки, упоминания или ID.'
			)
		}

		// Обновляем статус пользователя
		await db.run('UPDATE users SET status = ? WHERE vk_id = ?', [
			status,
			targetUserId,
		])
		await context.send(
			`🎉 Статус пользователя с ID ${targetUserId} успешно изменён на "${status}".`
		)
	} else if (message.startsWith('/clearwarvillage')) {
		if (allowedIds.includes(userId)) {
			// Сначала получаем информацию о деревнях, находящихся в процессе захвата
			db.all(
				`SELECT villages.name, clans.name AS clan_name 
             FROM villages 
             LEFT JOIN clans ON villages.attacking_clan_id = clans.id 
             WHERE villages.is_in_battle = 1`,
				[],
				async (err, villagesInBattle) => {
					if (err) {
						await context.send(
							`${await getUserMention(
								userId
							)}, ❌ Произошла ошибка при получении данных о деревнях.`
						)
						console.error(err)
					} else if (villagesInBattle.length === 0) {
						await context.send(
							`${await getUserMention(
								userId
							)}, ❌ Нет активных захватов деревень.`
						)
					} else {
						// Очищаем захваты деревень
						db.run(
							`UPDATE villages SET is_in_battle = 0, attacking_clan_id = NULL`,
							[],
							async err => {
								if (err) {
									await context.send(
										`${await getUserMention(
											userId
										)}, ❌ Произошла ошибка при очистке активных захватов деревень.`
									)
									console.error(err)
								} else {
									// Формируем сообщение с информацией о кланах, чьи захваты были очищены
									const clearedVillagesInfo = villagesInBattle
										.map(
											village =>
												`Деревня "${village.name}" (Клан: ${
													village.clan_name || 'Неизвестно'
												})`
										)
										.join('\n')

									await context.send(
										`${await getUserMention(
											userId
										)}, ✔️ Все активные захваты деревень очищены.\nОчищенные захваты:\n${clearedVillagesInfo}`
									)
								}
							}
						)
					}
				}
			)
		} else {
			await context.send(
				`${await getUserMention(
					userId
				)}, 😡 У вас нет прав для выполнения этой команды.`
			)
		}
	} // Команда для изъятия деревни из имущества клана
	else if (message.startsWith('/clearvillage')) {
		const [_, villageName] = message.split(' ')

		if (allowedIds.includes(userId)) {
			if (!villageName) {
				await context.send(
					`${await getUserMention(
						userId
					)}, ❌ Неверный формат команды. Используйте: /clearvillage [название деревни]`
				)
				return
			}

			// Извлекаем деревню с указанным названием
			db.get(
				`SELECT * FROM villages WHERE name = ?`,
				[villageName],
				async (err, village) => {
					if (err) {
						await context.send(
							`${await getUserMention(
								userId
							)}, ❌ Произошла ошибка при поиске деревни.`
						)
						console.error(err)
						return
					}

					if (!village || village.clan_id === null) {
						await context.send(
							`${await getUserMention(
								userId
							)}, 🗿 Деревня ${villageName} не принадлежит вашему клану или не найдена.`
						)
						return
					}

					// Проверяем, что деревня принадлежит клану
					db.run(
						`UPDATE villages SET clan_id = NULL WHERE name = ?`,
						[villageName],
						async err => {
							if (err) {
								await context.send(
									`${await getUserMention(
										userId
									)}, ❌ Произошла ошибка при изъятии деревни.`
								)
								console.error(err)
							} else {
								await context.send(
									`${await getUserMention(
										userId
									)}, ✔️ Деревня ${villageName} успешно изъята из имущества клана.`
								)
							}
						}
					)
				}
			)
		} else {
			await context.send(
				`${await getUserMention(
					userId
				)}, 😡 У вас нет прав для выполнения этой команды.`
			)
		}
	} else if (message === '/начать путь') {
		await context.send({
			message:
				'Привет, я Аяна Уэйн! Я помогу тебе разобраться в нашем боте. Для начала, давай я расскажу тебе, что можно делать. Нажимай на кнопки и пиши команды, которые я тебе скажу. Нажми на кнопку "Продолжить".',
			keyboard: Keyboard.builder()
				.textButton({
					label: 'Продолжить',
					payload: { command: 'continue' },
					color: Keyboard.POSITIVE_COLOR,
				})
				.inline(),
		})
	} else if (
		context.messagePayload &&
		context.messagePayload.command === 'continue'
	) {
		await context.send({
			message:
				'Ты можешь использовать разные команды. Например, чтобы узнать свой профиль, используй команду "/профиль".',
			keyboard: Keyboard.builder()
				.textButton({
					label: 'Что дальше?',
					payload: { command: 'what_next' },
					color: Keyboard.POSITIVE_COLOR,
				})
				.textButton({
					label: 'Профиль?',
					payload: { command: 'why_profile' },
					color: Keyboard.DEFAULT_COLOR,
				})
				.inline(),
		})
	} else if (
		context.messagePayload &&
		context.messagePayload.command === 'why_profile'
	) {
		await context.send(
			'Команда "/профиль" позволяет узнать информацию о твоем аккаунте, такие как ID, Ник, WCoin, рейтинг.\n\n💸 WCoin это основная валюта в боте, за них вы покупаете разные вещи, кейсы, где можно вывести приз, но об этом позже.\n💎 Ник нужен, чтобы легче было узнавать тебя в чате, кстати, его можно изменить.\n👑 Рейтинг показывает, сколько сообщений ты уже отправил и насколько часто ты активен.'
		)
	} else if (
		context.messagePayload &&
		context.messagePayload.command === 'what_next'
	) {
		await context.send('💸 Давай попробуем заработать WCoin.')
		await context.send({
			message:
				'У нас есть несколько видов заработка: собирать бонус, копать клад, перепродавать предметы другим игрокам на маркете или сражаться с врагами вместе с кланом. А для риссковых есть бар, прям как на ORP.\n\nДавай соберем бонус, напиши команду "/бонус".',
			keyboard: Keyboard.builder()
				.textButton({
					label: 'Что я получил?',
					payload: { command: 'what_i_got' },
					color: Keyboard.POSITIVE_COLOR,
				})
				.inline(),
		})
	} else if (
		context.messagePayload &&
		context.messagePayload.command === 'what_i_got'
	) {
		await context.send({
			message:
				'Ты заработал свои первые WCoin!😃\nА ещё ты получил предмет, не забывай про них, когда получаешь. Ты их в будущем можешь продать игрокам за WCoin.\n\nНо ты наверное и сам понимаешь, что это мало, а давай купим лопату?\nНапиши команду "/лопаты".',
			keyboard: Keyboard.builder()
				.textButton({
					label: 'Написал',
					payload: { command: 'write' },
					color: Keyboard.POSITIVE_COLOR,
				})
				.inline(),
		})
	} else if (
		context.messagePayload &&
		context.messagePayload.command === 'write'
	) {
		await context.send({
			message:
				'Смотри, цены и подсказка на команду есть. Помнишь сколько у тебя WCoin? Если вдруг забыл, напиши "/профиль".\n\nВыбирай ту лопату, на которую у тебя хватает WCoin или которую ты хочешь, если шипко богат😊\n\nАх да, если вдруг не понял команду, то команда работает примерно так "/купить лопату обычная".',
			keyboard: Keyboard.builder()
				.textButton({
					label: 'Я купил лопату',
					payload: { command: 'buy_shovels' },
					color: Keyboard.POSITIVE_COLOR,
				})
				.inline(),
		})
	} else if (
		context.messagePayload &&
		context.messagePayload.command === 'buy_shovels'
	) {
		await context.send({
			message:
				'Отлично! Теперь эта лопата у тебя в инвентаре, можешь даже убедиться "/лопаты"👌.\n\nНу что.. попробуем открыть? Учти, бывалые игроки не зря пишут про эти лопаты🤔. Вот например: "опук" или "попук". Смешно, не правда ли?😅\n\nДавай наконец откроем и узнаем, что там не так, потом нажми на кнопку "Опук".\n\nЕсли что, команда "/копать клад обычная", это к примеру, если ты купил обычную лопату.',
			keyboard: Keyboard.builder()
				.textButton({
					label: 'Опук',
					payload: { command: 'opyk' },
					color: Keyboard.POSITIVE_COLOR,
				})
				.inline(),
		})
	} else if (
		context.messagePayload &&
		context.messagePayload.command === 'opyk'
	) {
		await context.send({
			message:
				'Помнишь за сколько ты покупал лопату? А теперь сколько получил с копания клада. Вот тебе повезло, если у тебя "Опук", значит ты откопал больше, чем покупал. А бывает "Попук", когда ты откопал меньше, чем покупал. От сюда и появились слова Окупа и не повезло.\n\nТак, допустим мы уже научились покупать лопаты и собирать бонус. Но собственно вопрос: "Где деньги Любовски?", здесь обещали же какие-то кейсы, че-то открывать.\n\nНапиши команду "/купить кейс" и все тебе расскажу😊. Потом нажми кнопку "Опа кейсики".',
			keyboard: Keyboard.builder()
				.textButton({
					label: 'Опа кейсики',
					payload: { command: 'casses' },
					color: Keyboard.POSITIVE_COLOR,
				})
				.inline(),
		})
	} else if (
		context.messagePayload &&
		context.messagePayload.command === 'casses'
	) {
		await context.send({
			message:
				'Ага! Из всех этих кейсов, можно получить вирты или аксессуары, а с кейсов подороже еще и костюмы.\n\nДавай попробуем купить, а потом открыть кейс, кейс-новичок называется. Напиши команду "/купить кейс новичок".',
			keyboard: Keyboard.builder()
				.textButton({
					label: 'Я купил кейс',
					payload: { command: 'beginner' },
					color: Keyboard.POSITIVE_COLOR,
				})
				.row()
				.textButton({
					label: 'Откуда такая щедрость?',
					payload: { command: 'what_generosity' },
					color: Keyboard.DEFAULT_COLOR,
				})
				.inline(),
		})
	} else if (
		context.messagePayload &&
		context.messagePayload.command === 'what_generosity'
	) {
		await context.send(
			'Я бы тоже не поверила😊, но на самом деле так и есть.\nWaynes хочет как можно больше распиариться, а это как лучший способ поднять актив. Как говорил Роберт: "Отдай как можно больше - и получишь больше".\n\nНам выгоднее вам выдавать призы, чем ничего не давать😊'
		)
	} else if (
		context.messagePayload &&
		context.messagePayload.command === 'beginner'
	) {
		await context.send({
			message:
				'Молодец! Теперь очень важный момент, главное не запутаться✊.\n\nСейчас тебе нужно будет написать команду "/открыть кейс новичок". Тебе отправятся сразу 2 сообщения, обрати внимание на то, где ты успешно открыл кейс новичок.',
			keyboard: Keyboard.builder()
				.textButton({
					label: 'Ну открыл',
					payload: { command: 'open_beginner' },
					color: Keyboard.POSITIVE_COLOR,
				})
				.inline(),
		})
	} else if (
		context.messagePayload &&
		context.messagePayload.command === 'open_beginner'
	) {
		await context.send({
			message:
				'Видишь, ты открыл кейс и у тебя выпало 15.000$😃.\n\nМало подумаешь ты, но уже неплохо, темболее ты его получил бесплатно и можешь вывести уже прямо сейчас😉.\n\nДавай попоробуем вывести. У нас есть команда "/помощь", где рассказывается подробнее, как можно вывести приз.\nНо зачем тебе это сейчас читать, верно😊?\n\n1. Для начала, скопируй этот текст:\nВыплата с поста/кейса:\nНик:\nБанк.счет:\nДок-ва:\n\n2. Сделай скриншот экрана, где будет видно команду "/открыть кейс новичок" и сообщение от бота, что выпал приз 15.000$.\n\n3. Затем тебе нужно будет зайти в ЛС группы - https://vk.com/waynes_family но ты уже здесь, поэтому напиши например "Привет" и следующим сообщением скопированный текст, заполни данные.\n4. Теперь отправь скриншот и перешли сообщение сюда же, где бот написал о призе с кейса.\n\nИ все😊. Осталось ждать ответа от ассистента.',
			keyboard: Keyboard.builder()
				.textButton({
					label: 'Я все сделал, что еще?',
					payload: { command: 'more' },
					color: Keyboard.POSITIVE_COLOR,
				})
				.row()
				.textButton({
					label: 'Можно видео-формат?',
					payload: { command: 'video' },
					color: Keyboard.DEFAULT_COLOR,
				})
				.inline(),
		})
	} else if (
		context.messagePayload &&
		context.messagePayload.command === 'video'
	) {
		await context.send(
			'Конечно! Держи - https://vk.com/video-199010052_456239063?list=bff676fbfb33815ff9\n\nСама честно любитель смотреть видосики😊'
		)
	} else if (
		context.messagePayload &&
		context.messagePayload.command === 'more'
	) {
		await context.send({
			message:
				'Поздравляю, ты закончил путь новичка🎉! Держи промокод "Love_Waynes". Кстати, команда пишется "/usepromo [название промокода]", ты ведь помнишь, что нужно писать в квадратных скобках?😊\n\nЕсли что, можешь позвать меня снова, просто нажми на кнопку "Аяна приди" и я тебе расскажу про кланы, маркеты и много-много чего.\n\nДо встречи любимчик🤭',
			keyboard: Keyboard.builder()
				.textButton({
					label: 'Аяна приди',
					payload: { command: 'ayna' },
					color: Keyboard.POSITIVE_COLOR,
				})
				.inline(),
		})
	} else if (
		context.messagePayload &&
		context.messagePayload.command === 'ayna'
	) {
		await context.send({
			message:
				'Я тут! Я рада, что ты снова ко мне обратился🤭\n\nТак с чем тебе помочь?',
			keyboard: Keyboard.builder()
				.textButton({
					label: 'Что делать, если я забыл команду?',
					payload: { command: 'help_command' },
					color: Keyboard.POSITIVE_COLOR,
				})
				.row()
				.textButton({
					label: 'Что за маркет?',
					payload: { command: 'help_market' },
					color: Keyboard.POSITIVE_COLOR,
				})
				.row()
				.textButton({
					label: 'А что насчет кланов?',
					payload: { command: 'help_clan' },
					color: Keyboard.POSITIVE_COLOR,
				})
				.row()
				.textButton({
					label: 'Кому доверять и какие меры безопасности?',
					payload: { command: 'help_info' },
					color: Keyboard.POSITIVE_COLOR,
				})
				.inline(),
		})
	} else if (
		context.messagePayload &&
		context.messagePayload.command === 'help_command'
	) {
		await context.send(
			'Для этого есть команда "/команды".\nТам есть вся инфа, главное не забывай про "/"😊'
		)
	} else if (
		context.messagePayload &&
		context.messagePayload.command === 'help_market'
	) {
		await context.send(
			'Решил стать предпринимателем😏? Я люблю таких.\n\nСмотри у тебя есть команда "/wmarkets". Когда ты её пишешь, у тебя выходит информация по командам. А помнишь те самые предметы, которые выпадают? Эти предметы ты можешь там продать клановодам.\nКоманда "/предметы" поможет узнать, сколько у тебя сейчас. Учти, при выставлении и снятии предмета, как называется предмет, так и пиши. Например Зелье огня, а не зелье огня.'
		)
	} else if (
		context.messagePayload &&
		context.messagePayload.command === 'help_clan'
	) {
		await context.send(
			'Решил поучаствовать в битве с врагами вместе с клановодами? А ты смелый парень😊.\n\nКоманда "/wclan" покажет тебе все команды с кланами. Ты можешь создать свой клан, он стоит 5000 WCoin, дороговато да, либо присоединиться к кому-нибудь.\nТебе нужно будет помогать создателю добывать предметы, потому что без них у вас шансов против врагов нет!\nКоманда "/wclan враги", подскажет, какие есть слабые места у врагов. Кстати ударять надо предметом, а обычный удар будет наносить только 30урона, а враг наносит от 15 до 50 урона.'
		)
	} else if (
		context.messagePayload &&
		context.messagePayload.command === 'help_info'
	) {
		await context.send(
			'Я рада, что ты решил уточнить этот вопрос.\n\nНаш блог разработки: https://vk.com/waynes_development\nЗдесь ты узнаешь о новых обновлениях и новых промокодах.\n\nНаша официальная группа: https://vk.com/waynes_family\nЗдесь ты можешь предлагать улучшения, говорить о багах, нарушениях и выводить призы.\n\nПожалуйста, запомни. Мы не просим пароли и не прокачиваем аккаунты. Мы не пишем сами (искл. официальная группа, смотри внимательнее на ссылку).'
		)
	} 
})

// Функция обновления рейтинга
async function updateUserRating(vk_id, ratingIncrement) {
	const user = await getUser(vk_id)

	// Проверяем, существует ли пользователь
	if (!user) {
		console.log(`Пользователь с vk_id ${vk_id} не найден.`)
		return // Если пользователь не найден, не обновляем рейтинг
	}

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
	const excludedIds = [252840773, 422202607] // IDs, которые нужно исключить
	const placeholders = excludedIds.map(() => '?').join(', ') // Создаем строку "?, ?" для запроса
	return new Promise((resolve, reject) => {
		db.all(
			`SELECT vk_id, nickname, wcoin FROM users WHERE vk_id NOT IN (${placeholders}) ORDER BY wcoin DESC LIMIT ?`,
			[...excludedIds, limit],
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

console.log('Скрипт запущен 1.1.2')
