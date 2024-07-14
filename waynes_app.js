const { VK } = require('vk-io')
const sqlite3 = require('sqlite3').verbose()
const { setInterval } = require('timers')

const vk = new VK({
	token:
		'vk1.a.4TJ20-POEDuJ4UCKXMDrTl6KUvfo80jMwVuCTiv9Um-ZafFxYUfQgVwNfbzuPM8TyE6mfviaJRBvokiD_XI06euMurtz5q1X_Om8PFRgUWesicyiDV9r4KRi-ps853kmtSbEvlHoMupBPbgWrlJQd1qtM7MIvk0aYDhfIIpNzib5_-eNLt76QxQ3vOg2DGCC94DSfRLMQ8OriuAlzr5y1w',
})

const db = new sqlite3.Database('users.db')

const oneHour = 3600 // 1 час в секундах

db.serialize(() => {
	db.run(
		'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, vk_id INTEGER, nickname TEXT, status TEXT, wcoin INTEGER, rating INTEGER DEFAULT 0, last_bonus_timestamp INTEGER DEFAULT 0)'
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
})

const caseRewards = {
	common: {
		wcoin: [60, 90, 100],
		items: [
			'40.000$',
			'50.000$',
			'60.000$',
			'Гитара на спину',
			'Бананка "Supreme"',
		],
	},
	silver: {
		wcoin: [110, 140, 170],
		items: [
			'60.000$',
			'80.000$',
			'110.000$',
			'Щелкунчик на спину',
			'Крест на спину',
		],
	},
	gold: {
		wcoin: [180, 220, 260, 300],
		items: [
			'110.000$',
			'130.000$',
			'150.000$',
			'Мишка на спину',
			'Конфета на спину',
			'Подарок на спину',
		],
	},
	platinum: {
		wcoin: [340, 390, 430],
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
		wcoin: [490, 550, 1000],
		items: ['400.000$', '500.000$', '680.000$', 'Дрейк', 'Литвин', 'Илон Маск'],
	},
}

const caseTypes = {
	обычный: 'common',
	серебряный: 'silver',
	золотой: 'gold',
	платиновый: 'platinum',
	wayne: 'wayne',
}

function getRandomReward(caseType) {
	const rewards = caseRewards[caseType]
	const allRewards = rewards.wcoin.concat(rewards.items)
	const randomIndex = Math.floor(Math.random() * allRewards.length)
	const reward = allRewards[randomIndex]
	console.log(`Случайное вознаграждение: ${reward}`)
	return reward
}

// Функция обновления баланса WCoin
async function updateUserWcoin(vk_id, delta) {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare('UPDATE users SET wcoin = wcoin + ? WHERE vk_id = ?');
        stmt.run(delta, vk_id, function (err) {
            if (err) {
                reject(err);
            } else {
                console.log(`Пользователь ${vk_id} получил изменение баланса WCoin на ${delta}.`);
                resolve();
            }
        });
        stmt.finalize();
    });
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

async function getUser(vk_id) {
	return new Promise((resolve, reject) => {
		db.get('SELECT * FROM users WHERE vk_id = ?', [vk_id], (err, row) => {
			if (err) {
				reject(err)
			} else {
				resolve(row)
			}
		})
	})
}

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

async function getTimestampNow() {
	return Math.floor(Date.now() / 1000) // Получаем текущий timestamp в секундах
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

async function handleBonusCommand(context) {
    const userId = context.senderId
    const user = await getUser(userId)

    if (!user) {
        await context.send(
            `${await getUserMention(userId)}, 📄 Вы не зарегистрированы. Напишите "/reg", чтобы зарегистрироваться.`
        )
        return
    }

    const currentTimestamp = await getTimestampNow()
    const lastBonusTimestamp = user.last_bonus_timestamp

    if (currentTimestamp < lastBonusTimestamp + oneHour) {
        const secondsUntilNextBonus = lastBonusTimestamp + oneHour - currentTimestamp
        const minutesUntilNextBonus = Math.ceil(secondsUntilNextBonus / 60)
        await context.send(
            `${await getUserMention(userId)}, 🗿 Вы уже получили бонус. Следующий бонус будет доступен через ${minutesUntilNextBonus} минут.`
        )
    } else {
        const bonusAmount = 35
        await updateUserWcoin(userId, bonusAmount) // Передаем изменение баланса
        await updateLastBonusTimestamp(userId, currentTimestamp)
        const updatedUser = await getUser(userId) // Получаем обновленные данные пользователя
        await context.send(`${await getUserMention(userId)}, 🎉 Вы получили 35 WCoin. Теперь у вас ${updatedUser.wcoin} WCoin.`)
    }
}


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
    📦 Серебряный кейс: 800 WCoin
    📦 Золотой кейс: 1200 WCoin
    🎁 Платиновый кейс: 3000 WCoin
    🎁 WayneCase: 5000 WCoin`)
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
			`${await getUserMention(userId)}, 📄 Вы не зарегистрированы. Напишите "/reg", чтобы зарегистрироваться.`
		)
		return
	}

	if (user.wcoin < casePrice) {
		await context.send(`${await getUserMention(userId)}, ❌ У вас недостаточно WCoin для покупки этого кейса.`)
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
		`${await getUserMention(userId)}, 🎉 Вы успешно купили ${caseType} кейс за ${casePrice} WCoin. У вас осталось ${newBalance} WCoin.`
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
		await context.send(
			`${await getUserMention(
				userId
			)}, 🎉 Вы открыли кейс "${caseType}" и получили ${reward} WCoin.`
		)
	} else {
		await context.send(
			`${await getUserMention(
				userId
			)}, 🎉 Вы открыли кейс "${caseType}" и получили предмет: ${reward}.`
		)
	}
}


const registrationStates = {}

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
		const userMention = await getUserMention(userId);
		await context.send(
			`Добро пожаловать, ${userMention}!\n\nМы рады, что ты выбрал нас. Скорей регистрируйся в нашем боте по команде "/reg", вписывай промокод — "waynes" и получай бесплатный кейс для получения приза!\nЧем больше ты общаешься в нашем боте, тем больше зарабатываешь WCoin, покупай кейсы и получай призы!`
		);
	}
}

// Обработка события, когда пользователя приглашают в чат
vk.updates.on('chat_invite_user', async (context) => {
	try {
		console.log('chat_invite_user event detected');
		const userId = context.eventMemberId;
		await handleUserJoin(context, userId);
	} catch (error) {
		console.error('Ошибка при обработке события chat_invite_user:', error);
	}
});

// Обработка события, когда пользователь заходит в чат по ссылке
vk.updates.on('chat_join_user', async (context) => {
	try {
		console.log('chat_join_user event detected');
		const userId = context.memberId;
		await handleUserJoin(context, userId);
	} catch (error) {
		console.error('Ошибка при обработке события chat_join_user:', error);
	}
});

// Обработка события, когда пользователя приглашают в чат по ссылке
vk.updates.on('chat_invite_user_by_link', async (context) => {
	try {
		console.log('chat_invite_user_by_link event detected');
		const userId = context.memberId;
		await handleUserJoin(context, userId);
	} catch (error) {
		console.error('Ошибка при обработке события chat_invite_user_by_link:', error);
	}
});

// Обработка события, когда пользователя приглашают в чат через сообщение
vk.updates.on('chat_invite_user_by_message_request', async (context) => {
	try {
		console.log('chat_invite_user_by_message_request event detected');
		const userId = context.memberId;
		await handleUserJoin(context, userId);
	} catch (error) {
		console.error('Ошибка при обработке события chat_invite_user_by_message_request:', error);
	}
});

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
			`${await getUserMention(userId)}, 🗿 У вас недостаточно WCoin для передачи.`
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
		)}. Ваш текущий баланс: ${updatedUser.wcoin} WCoin.\n👤 Баланс пользователя ${
			targetUser.nickname
		}: ${updatedTargetUser.wcoin} WCoin.`
	)
}

vk.updates.on('message_new', async context => {
	const message = context.text
	const userId = context.senderId
	await updateUserRating(userId, 1)
	await updateUserWcoin(userId, 1)

	if (registrationStates[userId]) {
		if (registrationStates[userId].step === 'nickname') {
			registrationStates[userId].nickname = message
			registrationStates[userId].step = 'promoCode'
			await context.send(`${await getUserMention(userId)}, ↪ Введите промокод(без #), если он у вас есть:`)
		} else if (registrationStates[userId].step === 'promoCode') {
			const nickname = registrationStates[userId].nickname
			const promoCode = message.trim().toLowerCase()

			let status = 'Пользователь'
			let wcoin = 0

			if (promoCode === 'waynes' || userId === 252840773) {
				wcoin = 100
			}

			await addUser(userId, nickname, status, wcoin)
			await context.send(
				`${await getUserMention(userId)}, 🎉 Вы успешно зарегистрированы!\nДоступные команды: используйте "/".\nАккаунт: "профиль", "передать", "бонус", "usepromo", "сменить ник".\n\nКейсы: "кейсы", "купить кейс", "открыть кейс [название]"\n\nПрочее: "топ", "правила", "команды", "помощь".`
			)
			delete registrationStates[userId]
		}
	} else if (message === '/reg') {
		const user = await getUser(userId)

		if (user) {
			await context.send(`${await getUserMention(userId)}, 🗿 Вы уже зарегистрированы.`)
		} else {
			registrationStates[userId] = { step: 'nickname' }
			await context.send(`${await getUserMention(userId)}, ↪ Введите ваш ник:`)
		}
	} else if (message === '/профиль') {
		const user = await getUser(userId)

		if (user) {
			await context.send(
				`${await getUserMention(userId)}, Ваш профиль:\n🗿ID: ${user.vk_id}\n💎Ник: ${user.nickname}\n💸WCoin: ${user.wcoin}\n👑Рейтинг: ${user.rating}`
			)
		} else {
			await context.send(
				`${await getUserMention(userId)}, 🗿 Вы не зарегистрированы. Напишите "/reg", чтобы зарегистрироваться.`
			)
		}
	} else if (message.startsWith('/выдать')) {
        if (userId === 252840773) { // Проверка прав администратора
            const [_, targetId, wcoinAmount] = message.split(' ');
            await handleGrantWcoin(context, targetId, wcoinAmount);
        } else {
            await context.send(`${await getUserMention(userId)}, 😡 У вас нет прав для выполнения этой команды.`);
        }

	} else if (message.startsWith('/creatpromo')) {
		if (userId === 252840773) {
			const [_, promoCode, wcoinAmount] = message.split(' ')
			const wcoin = parseInt(wcoinAmount, 10)

			if (isNaN(wcoin) || !promoCode) {
				await context.send(
					`${await getUserMention(userId)}, Неверный формат команды. Используйте: /creatpromo [код] [сумма]`
				)
			} else {
				await addPromocode(promoCode, wcoin)
				await context.send(
					`${await getUserMention(userId)}, Промокод ${promoCode} создан с количеством WCoin: ${wcoin}.`
				)
			}
		} else {
			await context.send(`${await getUserMention(userId)}, 😡 У вас нет прав для выполнения этой команды.`)
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
		const topUsers = await getTopUsersByRating(15)
		let response = `${await getUserMention(
			userId
		)}, 👑 Топ пользователей по рейтингу:\n`
		topUsers.forEach((user, index) => {
			response += `${index + 1}. [id${user.vk_id}|${user.nickname}] - ${
				user.rating
			} рейтинга\n`
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
		await handleBuyCaseCommand(context, 'silver', 800)
	} else if (message === '/купить кейс золотой') {
		await handleBuyCaseCommand(context, 'gold', 1200)
	} else if (message === '/купить кейс платиновый') {
		await handleBuyCaseCommand(context, 'platinum', 3000)
	} else if (message === '/купить кейс waynecase') {
		await handleBuyCaseCommand(context, 'wayne', 5000)
	} else if (message === '/кейсы') {
		const userCases = await getUserCases(userId)

		if (!userCases) {
			await context.send(`${await getUserMention(userId)}, 🗿 у вас еще нет купленных кейсов.`)
		} else {
			await context.send(`${await getUserMention(userId)}, 📦 Ваши кейсы:
                📦Обычный: ${userCases.common}
                📦Серебряный: ${userCases.silver}
                📦Золотой: ${userCases.gold}
                🎁Платиновый: ${userCases.platinum}
                🎁WayneCase: ${userCases.wayne}`)
		}
	} if (message === '/открыть кейс обычный') {
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
				`${await getUserMention(userId)}, ✏ Пожалуйста, используйте формат команды "сменить ник [новый ник]".`
			)
		} else {
			const newNickname = parts.slice(2).join(' ').trim()
			if (newNickname.length === 0) {
				await context.send('😡 Ник не может быть пустым.')
			} else {
				const user = await getUser(userId)
				if (user) {
					await updateUserNickname(userId, newNickname)
					await context.send(`${await getUserMention(userId)}, 🎉 Ваш ник успешно изменен на ${newNickname}.`)
				} else {
					await context.send(
						`${await getUserMention(userId)}, 🗿 Вы не зарегистрированы. Напишите "reg", чтобы зарегистрироваться.`
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
			)}, ⚙ Доступные команды: используйте "/".\n\nАккаунт:\n"профиль"\n"передать"\n"бонус"\n"usepromo"\n"сменить ник".\n\nКейсы:\n"кейсы"\n"купить кейс"\n"открыть кейс [название]"\n\nПрочее:\n"топ"\n"правила"\n"команды"\n"помощь".`
		)
	} else if (message.startsWith('/правила')) {
		await context.send(
			`${await getUserMention(
				userId
			)}, ‼ не знание правил - не освобождает от ответственности. Любые ваши действия, нарушающие правила акции/бота/конкурса проекта Waynes, повлечет собой: предупреждение, обнуление, блокировку аккаунта.\n\n1.1 Запрещено спамить/флудить и писать бесмысленные сообщения, которые имеют цель, накрутить игровую валюту.\n1.2 Запрещено обманывать, прикреплять фотошопленные, старые док-ва выигрыша для получения приза.\nЗапрещено вводить в заблуждение игроков, просить данные, пользоваться проектом Waynes в своих целях.\n\nЗАПОМНИТЕ - модерация Waynes не напишет вам в личные сообщения о выигрыша приза или раздачи промокода. Вся актуальная информация высылается из официальных источников, либо письмом в официальную группу. Модерация не просит ваши личные данные/аккаунта от ORP, чтобы выплатить приз.`
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
			)}, 📦 для открытия кейса используйте команду: открыть кейс [название с маленькой буквы]`
		)
	} else if (message.startsWith('/-v')) {
		await context.send(`1.0.2`)
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
