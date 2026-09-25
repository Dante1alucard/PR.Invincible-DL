/**
 * bot.js — P.I.D.L. Telegram Klad Bot
 * Отправляет рандомный адрес клада в Москве по username покупателя.
*/

const TelegramBot = require('node-telegram-bot-api');
const { SocksProxyAgent } = require('socks-proxy-agent');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8760250777:AAHXN6KkKUHMqIvfMj-Be5QlQVXLsDsjU7Y';

const DB_USERS_FILE = path.join(__dirname, 'tg_users.json');

let userChatIds = {};
try {
  if (fs.existsSync(DB_USERS_FILE)) {
    userChatIds = JSON.parse(fs.readFileSync(DB_USERS_FILE, 'utf8'));
  }
} catch (e) {
  userChatIds = {};
}

function saveUserChatIds() {
  try {
    fs.writeFileSync(DB_USERS_FILE, JSON.stringify(userChatIds, null, 2), 'utf8');
  } catch (e) {
    console.error('[TG BOT] Ошибка сохранения tg_users.json:', e.message);
  }
}

const pendingOrders = {};
const pendingOrdersByOrderId = {};
let currentBotUsername = 'pidl_dark_bot';

let bot = null;

function initBot() {
  if (!BOT_TOKEN) {
    console.warn('[TG BOT] Токен не задан — бот отключён. Задайте TELEGRAM_BOT_TOKEN.');
    return;
  }

  bot = new TelegramBot(BOT_TOKEN, {
    polling: true,
    request: {
      agent: new SocksProxyAgent('socks5://127.0.0.1:10808')
    }
  });

  bot.getMe().then(me => {
    if (me && me.username) {
      currentBotUsername = me.username;
      console.log(`[TG BOT] Подключён к @${me.username}`);
    }
  }).catch(() => {
  });

  bot.onText(/\/start(?:\s+(.*))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const username = (msg.from.username || '').toLowerCase().replace(/^@/, '');
    const startParam = match && match[1] ? match[1].trim() : '';

    if (username) {
      userChatIds[username] = chatId;
      saveUserChatIds();
    }

    if (startParam && startParam.startsWith('order_')) {
      const orderId = startParam.replace('order_', '');
      const pendingByOrder = pendingOrdersByOrderId[orderId];
      if (pendingByOrder) {
        delete pendingOrdersByOrderId[orderId];
        if (pendingByOrder.username) delete pendingOrders[pendingByOrder.username];
        await sendKladMessage(chatId, orderId, pendingByOrder.spot, pendingByOrder.items);
        return;
      }

      const pending = username && pendingOrders[username];
      if (pending) {
        delete pendingOrders[username];
        if (pending.orderId) delete pendingOrdersByOrderId[String(pending.orderId)];
        await sendKladMessage(chatId, pending.orderId, pending.spot, pending.items);
        return;
      }

      const spot = getRandomSpot('обычная');
      await sendKladMessage(chatId, orderId, spot, []);
      return;
    }

    const pending = username && pendingOrders[username];
    if (pending) {
      delete pendingOrders[username];
      if (pending.orderId) delete pendingOrdersByOrderId[String(pending.orderId)];
      await sendKladMessage(chatId, pending.orderId, pending.spot, pending.items);
      return;
    }

    bot.sendMessage(chatId,
      'скоро...',
      { parse_mode: 'Markdown' }
    );
  });

  bot.on('polling_error', (err) => {
    console.error('[TG BOT] Polling error:', err.message);
  });

  console.log('[TG BOT] Бот запущен и слушает /start');
}

const MOSCOW_SPOTS = [
  { street: 'ул. Арбат, д. 12', district: 'Арбат', hint: 'у цветочного магазина, под третьей ступенькой слева', type: 'regular' },
  { street: 'Чистопрудный бул., д. 6', district: 'Чистые пруды', hint: 'за скамейкой у пруда, у корней большого дерева', type: 'regular' },
  { street: 'ул. Кузнецкий Мост, д. 3', district: 'Центр', hint: 'в щели между стеной и водосточной трубой', type: 'regular' },
  { street: 'Пречистенская наб., д. 9', district: 'Хамовники', hint: 'под бортовым камнем у реки', type: 'regular' },
  { street: 'ул. Садовая-Кудринская, д. 15', district: 'Краснопресненский', hint: 'у металлической решётки у входа', type: 'regular' },
  { street: 'Ленинградский просп., д. 37', district: 'Аэропорт', hint: 'за рекламным щитом у остановки', type: 'regular' },
  { street: 'ул. Тверская, д. 22', district: 'Тверской', hint: 'под урной, у левой ножки', type: 'regular' },
  { street: 'ул. Покровка, д. 4', district: 'Басманный', hint: 'в нише у подъезда, справа', type: 'regular' },
  { street: 'Котельническая наб., д. 1/15', district: 'Таганский', hint: 'у клумбы, под третьим кустом', type: 'regular' },
  { street: 'просп. Мира, д. 119', district: 'ВДНХ', hint: 'за фонарным столбом, у основания', type: 'regular' },
  { street: 'ул. Маросейка, д. 9', district: 'Китай-город', hint: 'под карнизом у входной двери', type: 'regular' },
  { street: 'ул. Солянка, д. 7', district: 'Таганский', hint: 'в выбоине тротуарной плитки', type: 'regular' },
  { street: 'ул. Остоженка, д. 3', district: 'Хамовники', hint: 'у корней старого дерева, 10 см вглубь', type: 'regular' },
  { street: 'Гоголевский бул., д. 8', district: 'Арбат', hint: 'за чугунной решёткой ограды', type: 'regular' },
  { street: 'ул. Большая Дмитровка, д. 7а', district: 'Тверской', hint: 'у ступенек, под третьей плитой', type: 'regular' },
  { street: 'ул. Рождественка, д. 5', district: 'Мещанский', hint: 'за водосточной трубой, у основания', type: 'regular' },
  { street: 'ул. Никитская Б., д. 19', district: 'Арбат', hint: 'под плиткой у ворот', type: 'regular' },
  { street: 'Сретенский бул., д. 6/1', district: 'Красносельский', hint: 'у скамейки, под левой ножкой', type: 'regular' },
  { street: 'ул. Воздвиженка, д. 9', district: 'Арбат', hint: 'в нише кирпичной стены, на высоте 60 см', type: 'regular' },
  { street: 'Цветной бул., д. 15', district: 'Мещанский', hint: 'у афишной тумбы, с обратной стороны', type: 'regular' },
  { street: 'ул. Пятницкая, д. 25', district: 'Замоскворечье', hint: 'под козырьком у магазина', type: 'regular' },
  { street: 'ул. Ордынка Б., д. 44', district: 'Замоскворечье', hint: 'за трансформаторной будкой', type: 'regular' },
  { street: 'ул. Долгоруковская, д. 33', district: 'Тверской', hint: 'в кустах у ограды, завёрнуто в пакет', type: 'regular' },
  { street: 'ул. Лесная, д. 4', district: 'Тверской', hint: 'под вентиляционной решёткой у стены', type: 'regular' },
  { street: 'ул. Новослободская, д. 14/19', district: 'Тверской', hint: 'у корней берёзы, под камнем', type: 'regular' },
  { street: 'ул. Мясницкая, д. 21', district: 'Красносельский', hint: 'в щели у лестничного пролёта', type: 'regular' },
  { street: 'ул. Пречистенка, д. 32', district: 'Хамовники', hint: 'под третьей ступенькой у входа', type: 'regular' },
  { street: 'ул. Волхонка, д. 12', district: 'Арбат', hint: 'за парковочным столбиком', type: 'regular' },
  { street: 'ул. Таганская, д. 9', district: 'Таганский', hint: 'у трансформаторной будки, снизу', type: 'regular' },
  { street: 'ул. Люсиновская, д. 36', district: 'Даниловский', hint: 'в нише подворотни, справа', type: 'regular' },
  { street: 'ул. Бакунинская, д. 5', district: 'Басманный', hint: 'под урной у остановки', type: 'regular' },
  { street: 'ул. Земляной Вал, д. 9', district: 'Таганский', hint: 'за рекламной конструкцией', type: 'regular' },
  { street: 'Хитровский пер., д. 3', district: 'Басманный', hint: 'у жёлтой стены, внизу', type: 'regular' },
  { street: 'ул. Нижняя Красносельская, д. 35', district: 'Басманный', hint: 'под плиткой у забора', type: 'regular' },
  { street: 'ул. Радио, д. 24', district: 'Басманный', hint: 'в выемке у кирпичной кладки', type: 'regular' },
  { street: 'ул. Электрозаводская, д. 21', district: 'Преображенское', hint: 'у ограды завода, справа', type: 'regular' },
  { street: 'ул. Сокольническая, д. 4а', district: 'Сокольники', hint: 'у столба освещения, 3 ряда плиток от угла', type: 'regular' },
  { street: 'ул. Щепкина, д. 6', district: 'Мещанский', hint: 'за урной, в кармане из скотча', type: 'regular' },
  { street: 'ул. Проспект Мира, д. 54', district: 'Мещанский', hint: 'в кустах у ограды', type: 'regular' },
  { street: 'ул. Гиляровского, д. 57', district: 'Мещанский', hint: 'у почтового ящика, снизу', type: 'regular' },
  { street: 'ул. Марксистская, д. 3', district: 'Таганский', hint: 'в щели у входа в подземку', type: 'regular' },
  { street: 'ул. Николоямская, д. 15', district: 'Таганский', hint: 'за декоративной плитой у стены', type: 'regular' },
  { street: 'ул. Б. Каменщики, д. 10', district: 'Таганский', hint: 'у трубы, примотано скотчем', type: 'regular' },
  { street: 'Яузская аллея, д. 2', district: 'Таганский', hint: 'под парковочным знаком', type: 'regular' },
  { street: 'ул. Гончарная, д. 7', district: 'Таганский', hint: 'у решётки подвала', type: 'regular' },
  { street: 'ул. Тулинская, д. 4', district: 'Даниловский', hint: 'за парапетом у набережной', type: 'regular' },
  { street: 'ул. Серпуховская Б., д. 27', district: 'Якиманка', hint: 'в нише у арки', type: 'regular' },
  { street: 'ул. Щипок, д. 6', district: 'Замоскворечье', hint: 'у металлических ворот, справа внизу', type: 'regular' },
  { street: 'ул. Климентовский пер., д. 9', district: 'Замоскворечье', hint: 'под козырьком у подъезда', type: 'regular' },
  { street: 'ул. Даниловский вал, д. 22', district: 'Даниловский', hint: 'за газовой трубой у стены', type: 'regular' }
];

const EXTRIMM_SPOTS = [
  {
    street: 'ул. Петровка, д. 38 (ГУ МВД России по г. Москве)',
    district: 'Тверской',
    hint: 'напротив центрального КПП Петровки 38, под фонарным столбом за служебной парковкой полиции',
    type: 'extrimm',
    category: 'police'
  },
  {
    street: 'ул. Сретенка, д. 11 (Отдел МВД России по Мещанскому р-ну)',
    district: 'Мещанский',
    hint: 'в 10 метрах от входа в дежурную часть ОВД, под металлическим контейнером у забора',
    type: 'extrimm',
    category: 'police'
  },
  {
    street: 'ул. Баррикадная, д. 4 (Отдел МВД России по Пресненскому р-ну)',
    district: 'Пресненский',
    hint: 'за стоянкой патрульных авто ОВД Пресненский, в нише кирпичного парапета',
    type: 'extrimm',
    category: 'police'
  },
  {
    street: 'ул. Большая Полянка, д. 33/41 (ОМВД России по району Якиманка)',
    district: 'Якиманка',
    hint: 'примагничено к металлической решётке цоколя прямо под окном дежурного офицера',
    type: 'extrimm',
    category: 'police'
  },
  {
    street: 'Олимпийский просп., д. 22 (УВД по ЦАО ГУ МВД)',
    district: 'Мещанский',
    hint: 'в густом кустарнике напротив камер наблюдения главного въезда в УВД',
    type: 'extrimm',
    category: 'police'
  },
  {
    street: 'Кривоколенный пер., д. 14 (ОМВД по Басманному району)',
    district: 'Басманный',
    hint: 'в арке в 20 метрах от шлагбаума отдела полиции, в трещине фундамента у водостока',
    type: 'extrimm',
    category: 'police'
  },
  {
    street: 'ул. Новокузнецкая, д. 27/6 (ОМВД по району Замоскворечье)',
    district: 'Замоскворечье',
    hint: 'с обратной стороны забора дежурной части, под угловым бордюрным камнем',
    type: 'extrimm',
    category: 'police'
  },
  {
    street: 'ул. Велозаводская, д. 6А (ОМВД по Южнопортовому району)',
    district: 'Южнопортовый',
    hint: 'за трансформаторной будкой прямо напротив въездного шлагбаума автопарка МВД',
    type: 'extrimm',
    category: 'police'
  },
  {
    street: 'ул. Бажова, д. 8 (ОМВД России по району Ростокино)',
    district: 'Ростокино',
    hint: 'в траве у информационного щита ОВД, завёрнуто в чёрную матовую плёнку',
    type: 'extrimm',
    category: 'police'
  },
  {
    street: 'Ленинский просп., д. 4 (Участковый пункт полиции №12)',
    district: 'Якиманка',
    hint: 'ровно под светящейся вывеской полиции, в нише фундаментной плиты здания',
    type: 'extrimm',
    category: 'police'
  },
  {
    street: 'ул. Нижняя Масловка, д. 8 (Отдел МВД России по району Беговой)',
    district: 'Беговой',
    hint: 'за пожарным шкафом у въездных ворот во внутренний двор дежурной части',
    type: 'extrimm',
    category: 'police'
  },
  {
    street: 'ул. Вавилова, д. 14 (Отдел МВД России по Гагаринскому р-ну)',
    district: 'Гагаринский',
    hint: 'под бетонной тумбой КПП напротив служебного въезда патрульных машин',
    type: 'extrimm',
    category: 'police'
  },
  {
    street: 'ул. Автозаводская, д. 17, к. 1 (Отдел полиции УВД на Московском метрополитене)',
    district: 'Даниловский',
    hint: 'у запасного пожарного выхода линейного отдела полиции, за вентиляционным коробом',
    type: 'extrimm',
    category: 'police'
  },

  {
    street: 'ул. Клары Цеткин, д. 18 (Заброшенный лабораторный корпус НИИ)',
    district: 'Войковский',
    hint: 'внутри заброшки: 1-й этаж, вентиляционная шахта в коридоре справа от пролома в стене',
    type: 'extrimm',
    category: 'abandoned'
  },
  {
    street: 'Варшавское шоссе, д. 39 (Заброшенный цех завода ЗИЛ)',
    district: 'Нагатино-Садовники',
    hint: 'заброшенная промзона ЗИЛ: внутри цеха, под ржавой металлической балкой у стремянки',
    type: 'extrimm',
    category: 'abandoned'
  },
  {
    street: 'ул. Электрозаводская, д. 27, стр. 5 (Заброшенный заводской склад)',
    district: 'Преображенское',
    hint: 'заброшенный кирпичный склад: сквозная дыра в кладке аварийного крыла на уровне пояса',
    type: 'extrimm',
    category: 'abandoned'
  },
  {
    street: 'ул. Касаткина, д. 11 (Заброшенный недостроенный медицинский комплекс)',
    district: 'Алексеевский',
    hint: 'цокольный уровень недостроя: в пустом дверном проёме под упавшей бетонной плитой',
    type: 'extrimm',
    category: 'abandoned'
  },
  {
    street: 'ул. Шоссейная, д. 90 (Территория заброшенного элеватора)',
    district: 'Печатники',
    hint: 'у подножия аварийной градирни, под проржавевшим листом кровельного железа',
    type: 'extrimm',
    category: 'abandoned'
  },
  {
    street: 'ул. Угрешская, д. 32 (Заброшенная ж/д ветка Южного речного порта)',
    district: 'Южнопортовый',
    hint: 'в развилке заброшенных рельсов за ржавым тупиковым упором, присыпано гравием',
    type: 'extrimm',
    category: 'abandoned'
  },
  {
    street: 'Огородный проезд, д. 16, стр. 3 (Заброшенный хладокомбинат)',
    district: 'Бутырский',
    hint: 'внутри ангара заброшки: за покосившейся дверью термоизоляционного отсека',
    type: 'extrimm',
    category: 'abandoned'
  },
  {
    street: 'ул. Бажова, д. 17 (Аварийное расселённое 4-этажное здание)',
    district: 'Ростокино',
    hint: 'заброшка: заколоченное окно со двора, в щели между досками и каменным подоконником',
    type: 'extrimm',
    category: 'abandoned'
  },
  {
    street: 'Дмитровское шоссе, д. 110, стр. 2 (Заброшенный недостроенный многоуровневый паркинг)',
    district: 'Бескудниковский',
    hint: '2-й ярус недостроя: за третьей колонной от пандуса, в угловой нише перекрытия',
    type: 'extrimm',
    category: 'abandoned'
  },
  {
    street: 'ул. Складочная, д. 1, стр. 18 (Заброшенная котельная бывшего завода Станколит)',
    district: 'Бутырский',
    hint: 'заброшенная котельная: в основании кирпичной трубы со стороны заросшего пустыря',
    type: 'extrimm',
    category: 'abandoned'
  },
  {
    street: 'ул. Берзарина, д. 36 (Бывшая заброшенная военная база)',
    district: 'Щукино',
    hint: 'в руинах КПП, в полости раскрытого щита электропроводки под слоем штукатурки',
    type: 'extrimm',
    category: 'abandoned'
  },
  {
    street: 'ул. Плеханова, д. 7 (Заброшенный цех завода ЖБИ)',
    district: 'Перово',
    hint: 'под накренившейся железобетонной плитой с полустёртой красной надписью 1982',
    type: 'extrimm',
    category: 'abandoned'
  },
  {
    street: 'Волоколамское шоссе, д. 86 (Заброшенный ангар Тушинского аэродрома)',
    district: 'Покровское-Стрешнево',
    hint: 'заброшенный ангар: в полуразрушенном техническом коллекторе за бетонным блоком',
    type: 'extrimm',
    category: 'abandoned'
  }
];

function getRandomSpot(type = 'обычная') {
  const isExtrimm = String(type).toLowerCase().includes('extrim') || String(type).toLowerCase().includes('экстрим');
  if (isExtrimm) {
    const spot = EXTRIMM_SPOTS[Math.floor(Math.random() * EXTRIMM_SPOTS.length)];
    return { ...spot, type: 'extrimm' };
  }
  const spot = MOSCOW_SPOTS[Math.floor(Math.random() * MOSCOW_SPOTS.length)];
  return { ...spot, type: 'regular' };
}

async function sendKladMessage(chatId, orderId, spot, orderItems = []) {
  if (!bot) return;

  const itemsList = orderItems.length > 0
    ? orderItems.map(it => `• ${it.title} × ${it.quantity}`).join('\n')
    : '• Вещи из заказа';

  const isExtrimm = spot.type === 'extrimm' || spot.category === 'police' || spot.category === 'abandoned';

  let header = `🖤 *P.I.D.L. // DARK LEGION — КЛАД #${orderId}*`;
  let sub = 'Заказ подтверждён. Твои шмотки ждут тебя.';
  let locLabel = '📍 *Адрес клада:*';
  let warning = '⚠️ _Адрес действителен 48 часов. Забирай быстро._';

  if (isExtrimm) {
    header = `🖤 *P.I.D.L. // DARK LEGION — КЛАД #${orderId}* 💀 *[EXTRIMM]*`;
    sub = spot.category === 'police'
      ? '🚨 *РЕЖИМ EXTRIMM: Локация у полицейского участка.* Будь предельно осторожен, не привлекай внимания патрулей.'
      : '🏚 *РЕЖИМ EXTRIMM: Локация на заброшке.* Смотри под ноги, адреналиновый режим активирован.';
    locLabel = '📍 *Экстремальная локация (EXTRIMM):*';
    warning = '⚠️ _ВНИМАНИЕ: Локация повышенного риска (полиция / заброшка). Не свети фонариком, действуй скрытно. Адрес действителен 48 часов._';
  }

  const message =
`${header}

${sub}

📦 *Состав:*
${itemsList}

${locLabel}
${spot.street}
Район: ${spot.district}

🗺 *Ориентир:*
${spot.hint}

${warning}

Твоё время. пришло...`;

  return await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

/**
 * Отправляет рандомный адрес клада пользователю по username.
 * Если chat_id известен — отправляет прямо в ЛС.
 * Если пользователь новый — сохраняет в очередь и отдает прямую ссылку для мгновенного старта.
 * Параметр kladType: 'обычная' | 'EXTRIMM'
 */
async function sendKladAddress(tgUsername, orderId, orderItems, kladType = 'обычная') {
  const username = (tgUsername || '').toLowerCase().replace(/^@/, '').trim();
  const spot = getRandomSpot(kladType);

  const result = {
    success: true,
    spot,
    kladType,
    botUsername: currentBotUsername,
    botLink: `https://t.me/${currentBotUsername}?start=order_${orderId}`,
    sentDirectly: false
  };

  const orderRecord = {
    orderId,
    spot,
    items: orderItems,
    username,
    timestamp: Date.now()
  };

  // Сохраняем заказ в очереди по orderId и по username
  pendingOrdersByOrderId[String(orderId)] = orderRecord;
  if (username) {
    pendingOrders[username] = orderRecord;
  }

  if (!bot) {
    console.warn('[TG BOT] Бот не инициализирован, токен не задан.');
    return result;
  }

  const chatId = userChatIds[username];

  if (chatId) {
    try {
      await sendKladMessage(chatId, orderId, spot, orderItems);
      console.log(`[TG BOT] ✅ Адрес клада (${spot.type}) успешно отправлен в ЛС @${username} (заказ #${orderId}): ${spot.street}`);
      result.sentDirectly = true;
      delete pendingOrdersByOrderId[String(orderId)];
      if (username) delete pendingOrders[username];
      return result;
    } catch (err) {
      console.warn(`[TG BOT] Ошибка отправки в ЛС @${username}:`, err.message);
    }
  }

  console.log(`[TG BOT] ⏱ Заказ #${orderId} (${spot.type}) поставлен в очередь для @${username}. При переходе по ссылке клад выдастся мгновенно.`);
  return result;
}

function getBotInfo() {
  return {
    botUsername: currentBotUsername,
    userCount: Object.keys(userChatIds).length
  };
}

// Инициализируем бот при загрузке модуля
initBot();

module.exports = { sendKladAddress, getBotInfo, getRandomSpot, MOSCOW_SPOTS, EXTRIMM_SPOTS };
