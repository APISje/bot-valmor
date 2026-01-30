const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType, StringSelectMenuBuilder, REST, Routes, ActivityType } = require('discord.js');
const fs = require('fs');
const path = require('path');

const SECRETS_FILE = path.join(__dirname, 'secrets.json');

function loadSecrets() {
    if (fs.existsSync(SECRETS_FILE)) {
        return JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf8'));
    }
    return {};
}

const secrets = loadSecrets();
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || secrets.DISCORD_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || secrets.GEMINI_API_KEY;

async function askGemini(question) {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: question }] }]
            })
        });
        const data = await response.json();
        console.log('Gemini Response:', JSON.stringify(data, null, 2));
        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            return data.candidates[0].content.parts[0].text;
        }
        if (data.error) {
            console.error('Gemini API Error:', data.error);
            return `Maaf, ada error: ${data.error.message || 'Unknown error'}`;
        }
        return 'Maaf, saya tidak bisa menjawab pertanyaan itu sekarang.';
    } catch (error) {
        console.error('Gemini API Error:', error);
        return 'Maaf, terjadi kesalahan saat menghubungi AI.';
    }
}

function getFormattedTime() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes} WIB`;
}

const statusList = [
    { name: () => `🕐 ${getFormattedTime()} | Valuamor System`, type: ActivityType.Watching },
    { name: () => `🎮 Online 24/7 | ${getFormattedTime()}`, type: ActivityType.Playing },
    { name: () => `👀 ${getFormattedTime()} | Serving Users`, type: ActivityType.Watching },
    { name: () => `🎵 Music & Time: ${getFormattedTime()}`, type: ActivityType.Listening }
];

let statusIndex = 0;

function updateBotStatus() {
    const status = statusList[statusIndex];
    client.user.setPresence({
        activities: [{ name: status.name(), type: status.type }],
        status: 'online'
    });
    statusIndex = (statusIndex + 1) % statusList.length;
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ]
});

const DB_FILE = path.join(__dirname, 'database.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');

function loadDatabase() {
    if (!fs.existsSync(DB_FILE)) {
        const defaultDb = {
            panels: {},
            redeemCodes: {},
            userKeys: {},
            hwids: {},
            premiumBuyers: {},
            partnerRequests: {},
            partnerConfig: {}
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2));
        return defaultDb;
    }
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!db.premiumBuyers) {
        db.premiumBuyers = {};
    }
    if (!db.partnerRequests) {
        db.partnerRequests = {};
    }
    if (!db.partnerConfig) {
        db.partnerConfig = {};
    }
    saveDatabase(db);
    return db;
}

function saveDatabase(db) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function loadConfig() {
    if (!fs.existsSync(CONFIG_FILE)) {
        const defaultConfig = {
            allowedUsername: 'tc_comunity',
            developmentUsername: '',
            developmentUserId: '1261619307683643415',
            adminRoles: []
        };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
        return defaultConfig;
    }
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

let database = loadDatabase();
let config = loadConfig();

function isPremiumActive(userId) {
    const buyer = database.premiumBuyers[userId];
    if (!buyer) return false;
    
    if (buyer.lifetime) return true;
    
    const now = Date.now();
    
    if (buyer.expiryDate && now >= buyer.expiryDate) {
        return false;
    }
    
    if (buyer.expiryDate && now < buyer.expiryDate) {
        return true;
    }
    
    return false;
}

function getRemainingTime(userId) {
    const buyer = database.premiumBuyers[userId];
    if (!buyer) return null;
    
    if (buyer.lifetime) return 'Lifetime';
    
    const now = Date.now();
    if (!buyer.expiryDate || now >= buyer.expiryDate) {
        return 'Expired / Berakhir';
    }
    
    const diff = buyer.expiryDate - now;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) {
        return `${days} days ${hours} hours / ${days} hari ${hours} jam`;
    } else {
        return `${hours} hours / ${hours} jam`;
    }
}

function addPremiumTime(userId, durationType, durationValue, grantedBy = 'System') {
    if (!database.premiumBuyers[userId]) {
        database.premiumBuyers[userId] = {
            userId: userId,
            addedDate: Date.now(),
            lifetime: false,
            autoRenew: false,
            expired: false,
            grantedBy: grantedBy
        };
    }
    
    const buyer = database.premiumBuyers[userId];
    
    buyer.expired = false;
    buyer.grantedBy = grantedBy;
    buyer.lastUpdate = Date.now();
    
    if (durationType === 'lifetime') {
        buyer.lifetime = true;
        buyer.expiryDate = null;
    } else {
        const now = Date.now();
        const currentExpiry = buyer.expiryDate && buyer.expiryDate > now ? buyer.expiryDate : now;
        
        let additionalTime = 0;
        if (durationType === 'seconds') {
            additionalTime = durationValue * 1000;
        } else if (durationType === 'days') {
            additionalTime = durationValue * 24 * 60 * 60 * 1000;
        } else if (durationType === 'months') {
            additionalTime = durationValue * 30 * 24 * 60 * 60 * 1000;
        } else if (durationType === 'years') {
            additionalTime = durationValue * 365 * 24 * 60 * 60 * 1000;
        }
        
        buyer.expiryDate = currentExpiry + additionalTime;
        buyer.lifetime = false;
    }
    
    saveDatabase(database);
}

function checkAndExpirePremiums() {
    const now = Date.now();
    let expiredCount = 0;
    let modified = false;
    
    for (const userId in database.premiumBuyers) {
        const buyer = database.premiumBuyers[userId];
        if (!buyer.lifetime && buyer.expiryDate && now >= buyer.expiryDate) {
            if (!buyer.expired) {
                buyer.expired = true;
                buyer.expiredAt = now;
                modified = true;
                expiredCount++;
                console.log(`⏰ Premium expired for user ${userId} - marked as expired`);
                
                try {
                    client.users.fetch(userId).then(user => {
                        const embed = new EmbedBuilder()
                            .setTitle('⏰ Premium Anda Telah Expired')
                            .setDescription('Akses premium Anda telah berakhir!')
                            .setColor(0xFF0000)
                            .addFields(
                                { name: '❌ Status', value: 'Premium Expired', inline: true },
                                { name: '📞 Perpanjang', value: 'Hubungi admin untuk perpanjang', inline: true }
                            )
                            .setTimestamp();
                        
                        user.send({ embeds: [embed] }).catch(() => {
                            console.log(`Could not DM user ${userId} about expiration`);
                        });
                    }).catch(() => {});
                } catch (error) {
                    console.log(`Error notifying user ${userId} about expiration`);
                }
            }
        }
    }
    
    if (modified) {
        saveDatabase(database);
        console.log(`✅ Checked ${Object.keys(database.premiumBuyers).length} premium users, ${expiredCount} newly expired and flagged`);
    }
}

setInterval(checkAndExpirePremiums, 60 * 60 * 1000);

const commands = [
    {
        name: 'development',
        description: 'Setup panel development (public access)'
    },
    {
        name: 'development2',
        description: 'Setup panel development2 (public access)'
    },
    {
        name: 'buybot',
        description: 'Informasi pembelian bot (Owner only)'
    },
    {
        name: 'redemkode',
        description: 'Generate redeem code otomatis (Owner only)'
    },
    {
        name: 'buatkey',
        description: 'Panel buat key development (Admin/Dev only)'
    },
    {
        name: 'len',
        description: 'Edit status panel (Admin/Dev only)'
    },
    {
        name: 'help',
        description: 'Menampilkan daftar command bot'
    },
    {
        name: 'setbuyer',
        description: 'Set premium buyer (Development only)'
    },
    {
        name: 'getstatus',
        description: 'Cek status premium Anda'
    },
    {
        name: 'redeem',
        description: 'Redeem kode premium/akses'
    },
    {
        name: 'requestpt',
        description: 'Setup partner request system (Admin only)'
    }
];

async function registerSlashCommands() {
    const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);
    
    try {
        console.log('🔄 Started refreshing application (/) commands.');
        
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        
        console.log('✅ Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('❌ Error registering slash commands:', error);
    }
}

client.once('ready', async () => {
    console.log(`✅ Bot logged in as ${client.user.tag}`);
    console.log(`📋 Listening for commands: !development, !development2, !buybot, !redemkode, !buatkey, !LEN, !help`);
    console.log(`📋 Slash commands: /development, /development2, /buybot, /redemkode, /buatkey, /len, /help`);
    console.log(`📢 Allowed username: ${config.allowedUsername}`);
    console.log(`🔑 Development username: ${config.developmentUsername}`);
    console.log(`🔑 Development user ID: ${config.developmentUserId}`);
    
    await registerSlashCommands();
    
    updateBotStatus();
    setInterval(updateBotStatus, 15000);
    console.log('✨ Bot status set to Online with rotating status');
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.mentions.has(client.user) && !message.author.bot) {
        const question = message.content.replace(/<@!?\d+>/g, '').trim();
        if (question.length > 0) {
            await message.channel.sendTyping();
            const reply = await askGemini(question);
            const chunks = reply.match(/[\s\S]{1,1900}/g) || [reply];
            for (const chunk of chunks) {
                await message.reply(chunk);
            }
        } else {
            await message.reply('Halo! Tag aku dengan pertanyaan dan aku akan menjawab menggunakan AI! 🤖');
        }
        return;
    }

    const content = message.content.trim();

    console.log(`📨 Message received: "${content}" from ${message.author.tag} in channel: ${message.channel.name}`);

    if (content === '!development') {
        console.log(`🛠️ Processing !development command - PUBLIC ACCESS`);
        console.log(`✅ Sending development panel (public access)...`);
        await handleDevelopmentPanel(message, false);
    }

    else if (content === '!development2') {
        console.log(`🛠️ Processing !development2 command - PUBLIC ACCESS`);
        console.log(`✅ Sending development2 panel (public access)...`);
        await handleDevelopmentPanel(message, true);
    }

    else if (content === '!buybot') {
        console.log(`🛒 Processing !buybot command`);
        if (message.author.username !== config.allowedUsername) {
            console.log(`❌ Wrong username. Expected: ${config.allowedUsername}, Got: ${message.author.username}`);
            try {
                await message.author.send('❌ You are not the owner! / Anda bukan owner! This command is owner only.');
            } catch (error) {
                await message.reply('❌ You are not the owner! / Anda bukan owner!');
            }
            return;
        }
        console.log(`✅ Username valid, sending buybot panel...`);
        await handleBuyBotPanel(message);
    }

    else if (content === '!redemkode') {
        console.log(`🎟️ Processing !redemkode command`);
        if (message.author.username !== config.allowedUsername) {
            console.log(`❌ Wrong username. Expected: ${config.allowedUsername}, Got: ${message.author.username}`);
            try {
                await message.author.send('❌ You are not the owner! / Anda bukan owner!');
            } catch (error) {
                await message.reply('❌ You are not the owner! / Anda bukan owner!');
            }
            return;
        }
        console.log(`✅ Username valid, sending redeem panel...`);
        await handleRedeemCodePanel(message);
    }

    else if (content === '!buatkey' || content === '!createkey') {
        console.log(`🔑 Processing !buatkey command`);
        const isAuthorized = message.author.username === config.developmentUsername || 
                            message.author.id === config.developmentUserId;
        if (!isAuthorized) {
            console.log(`❌ Not authorized. Username: ${message.author.username}, ID: ${message.author.id}`);
            return message.reply('❌ This command is for development only! / Command ini hanya untuk development!');
        }
        console.log(`✅ User authorized (development), sending create key panel...`);
        await handleCreateKeyPanel(message);
    }

    else if (content === '!LEN') {
        console.log(`⚙️ Processing !LEN command`);
        const isAuthorized = message.author.username === config.developmentUsername || 
                            message.author.id === config.developmentUserId;
        if (!isAuthorized) {
            console.log(`❌ Not authorized for !LEN. Username: ${message.author.username}, ID: ${message.author.id}`);
            return message.reply('❌ This command is for development only! / Command ini hanya untuk development!');
        }
        console.log(`✅ User authorized, sending LEN status panel...`);
        await handleLENPanel(message);
    }

    else if (content === '!help' || content === '!commands') {
        const helpEmbed = new EmbedBuilder()
            .setTitle('📋 Valuamor Bot - Help / Bantuan')
            .setDescription('Available commands / Daftar command:')
            .setColor(0x5865F2)
            .addFields(
                { name: '🔓 Public', value: '`/development` | `!development` - Setup Panel\n`/help` - Show this list', inline: false },
                { name: '🔒 Owner', value: '`/buybot` | `!buybot` - Buybot Info\n`/redemkode` | `!redemkode` - Generate Code', inline: false },
                { name: '🔑 Admin/Dev', value: '`/buatkey` - Create Key\n`/len` - Edit Panel Status', inline: false }
            )
            .setTimestamp()
            .setFooter({ text: 'Valuamor Bot System' });
        
        await message.reply({ embeds: [helpEmbed] });
    }

    else if (content === '!requestpt') {
        console.log(`🤝 Processing !requestpt command - Partner Panel`);
        await handlePartnerRequestPanel(message);
    }

    else if (content === '!partnerset') {
        console.log(`⚙️ Processing !partnerset command - Partner Setup`);
        const isAuthorized = message.author.username === config.allowedUsername || 
                            message.author.id === config.developmentUserId;
        if (!isAuthorized) {
            return message.reply('❌ Command ini hanya bisa digunakan oleh admin!');
        }
        await handlePartnerSetupPanel(message);
    }
});

async function handleDevelopmentPanel(message, isPublic) {
    const panelType = isPublic ? 'development2' : 'development';
    const embed = new EmbedBuilder()
        .setTitle(`🛠️ ${panelType.toUpperCase()} Panel Setup`)
        .setDescription('Choose action / Pilih aksi:')
        .setColor(0x5865F2)
        .setImage('https://cdn.discordapp.com/attachments/1441807323512438795/1456621144466522185/DEV_PANEL_20260101_105726_0000.png?ex=695907a7&is=6957b627&hm=47f4941989d2233280897eb3a62bccf65f5de49a28c77c3375e40a1912dd31c7&')
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`${panelType}_setchannel`)
                .setLabel('Set Channel')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📢'),
            new ButtonBuilder()
                .setCustomId(`${panelType}_setdesc`)
                .setLabel('Set Description / Deskripsi')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📝'),
            new ButtonBuilder()
                .setCustomId(`${panelType}_settitle`)
                .setLabel('Set Title / Judul')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('✏️'),
            new ButtonBuilder()
                .setCustomId(`${panelType}_setscript`)
                .setLabel('Set Script')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📜'),
            new ButtonBuilder()
                .setCustomId(`${panelType}_setrole`)
                .setLabel('Set Role')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('👥')
        );

    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`${panelType}_setstatus`)
                .setLabel('Set Status')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⚙️'),
            new ButtonBuilder()
                .setCustomId(`${panelType}_preview`)
                .setLabel('Preview')
                .setStyle(ButtonStyle.Success)
                .setEmoji('👁️'),
            new ButtonBuilder()
                .setCustomId(`${panelType}_send`)
                .setLabel('Send Panel / Kirim')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🚀')
        );

    await message.reply({ embeds: [embed], components: [row, row2] });
}

async function handleBuyBotPanel(message) {
    try {
        const dmEmbed = new EmbedBuilder()
            .setTitle('🛒 Pembelian BuyBot - ANTC Store')
            .setDescription('Hallo kak untuk membeli buybot anda perlu ke nomor whatsapp kami official antc store\n\n📱 **WhatsApp Official:**\n+62 813-3003-2894')
            .setColor(0x57F287)
            .setTimestamp()
            .setFooter({ text: 'ANTC Store - Official Support' });

        await message.author.send({ embeds: [dmEmbed] });

        await message.reply('✅ Informasi pembelian telah dikirim ke DM Anda! Silakan cek inbox Discord Anda.');
    } catch (error) {
        console.error('Error sending DM:', error);

        const publicEmbed = new EmbedBuilder()
            .setTitle('🛒 Pembelian BuyBot - ANTC Store')
            .setDescription('Hallo kak untuk membeli buybot anda perlu ke nomor whatsapp kami official antc store\n\n📱 **WhatsApp Official:**\n+62 813-3003-2894')
            .setColor(0x57F287)
            .setTimestamp()
            .setFooter({ text: 'ANTC Store - Official Support' });

        await message.reply({ 
            content: '⚠️ Tidak bisa mengirim DM. Berikut informasi pembeliannya:',
            embeds: [publicEmbed] 
        });
    }
}

async function handleRedeemCodePanel(message) {
    const generatedKey = generateRedeemCode();
    const guildId = message.guild.id;

    if (!database.redeemCodes[generatedKey]) {
        database.redeemCodes[generatedKey] = {
            rank: 'buyer',
            used: false,
            usedBy: null,
            usedInGuild: null,
            createdAt: Date.now(),
            createdBy: message.author.id,
            singleUsePerServer: true
        };
        saveDatabase(database);
    }

    const embed = new EmbedBuilder()
        .setTitle('🎟️ Redeem Code Auto-Generated!')
        .setDescription(`Kode redeem telah dibuat otomatis!\n\n**Kode:** \`${generatedKey}\`\n**Type:** 1x pakai per server\n**Status:** ✅ Belum digunakan\n**Created by:** ${message.author.tag}`)
        .setColor(0x57F287)
        .setTimestamp()
        .setFooter({ text: 'Valuamor Redeem System' });

    await message.reply({ embeds: [embed] });
}

async function handleCreateKeyPanel(message) {
    const embed = new EmbedBuilder()
        .setTitle('🔑 Buat Key Development')
        .setDescription('**Panel Khusus Development**\n\nBuat key otomatis untuk player dengan role khusus.\n\nKlik tombol di bawah untuk membuat key:')
        .setColor(0x5865F2)
        .setTimestamp()
        .setFooter({ text: 'Development Channel Only' });

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('createkey_start')
                .setLabel('Buat Key Baru')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✨'),
            new ButtonBuilder()
                .setCustomId('createkey_list')
                .setLabel('List Key')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📋'),
            new ButtonBuilder()
                .setCustomId('createkey_delete')
                .setLabel('Hapus Key')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️')
        );

    await message.reply({ embeds: [embed], components: [row] });
}

async function handleLENPanel(message) {
    const availablePanels = Object.entries(database.panels).filter(([key, data]) => data.title);

    if (availablePanels.length === 0) {
        return message.reply('❌ Belum ada panel yang tersedia! Buat panel terlebih dahulu dengan !development atau !development2.');
    }

    const options = availablePanels.map(([panelType, data]) => ({
        label: data.title || panelType,
        value: panelType,
        description: `Status: ${data.status || 'active'}`
    }));

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('len_selectpanel')
        .setPlaceholder('Pilih panel untuk edit status')
        .addOptions(options.slice(0, 25));

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const embed = new EmbedBuilder()
        .setTitle('⚙️ Valuamor - Edit Status Panel')
        .setDescription('Pilih panel yang ingin Anda edit statusnya:')
        .setColor(0x5865F2)
        .setTimestamp();

    await message.reply({ embeds: [embed], components: [row] });
}

client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        
        try {
            if (commandName === 'development') {
                console.log(`🛠️ Processing /development slash command - PUBLIC ACCESS`);
                await handleDevelopmentPanel(interaction, false);
            } else if (commandName === 'development2') {
                console.log(`🛠️ Processing /development2 slash command - PUBLIC ACCESS`);
                await handleDevelopmentPanel(interaction, true);
            } else if (commandName === 'buybot') {
                console.log(`🛒 Processing /buybot slash command`);
                if (interaction.user.username !== config.allowedUsername) {
                    console.log(`❌ Wrong username. Expected: ${config.allowedUsername}, Got: ${interaction.user.username}`);
                    return interaction.reply({ content: '❌ Anda bukan owner! Command ini hanya bisa digunakan oleh username tc_comunity.', ephemeral: true });
                }
                await handleBuyBotPanel(interaction);
            } else if (commandName === 'redemkode') {
                console.log(`🎟️ Processing /redemkode slash command`);
                if (interaction.user.username !== config.allowedUsername) {
                    console.log(`❌ Wrong username. Expected: ${config.allowedUsername}, Got: ${interaction.user.username}`);
                    return interaction.reply({ content: '❌ Anda bukan owner! Command ini hanya bisa digunakan oleh username tc_comunity.', ephemeral: true });
                }
                await handleRedeemCodePanel(interaction);
            } else if (commandName === 'buatkey') {
                console.log(`🔑 Processing /buatkey slash command`);
                const isAuthorized = interaction.user.username === config.developmentUsername || 
                                    interaction.user.id === config.developmentUserId;
                if (!isAuthorized) {
                    console.log(`❌ Not authorized. Username: ${interaction.user.username}, ID: ${interaction.user.id}`);
                    return interaction.reply({ content: '❌ Command ini hanya bisa digunakan oleh user development khusus!', ephemeral: true });
                }
                await handleCreateKeyPanel(interaction);
            } else if (commandName === 'len') {
                console.log(`⚙️ Processing /len slash command`);
                const isAuthorized = interaction.user.username === config.developmentUsername || 
                                    interaction.user.id === config.developmentUserId;
                if (!isAuthorized) {
                    console.log(`❌ Not authorized for /len. Username: ${interaction.user.username}, ID: ${interaction.user.id}`);
                    return interaction.reply({ content: '❌ Command ini hanya bisa digunakan oleh user development khusus!', ephemeral: true });
                }
                await handleLENPanel(interaction);
            } else if (commandName === 'setbuyer') {
                console.log(`💎 Processing /setbuyer slash command`);
                const isOwner = interaction.user.username === config.allowedUsername;
                if (!isOwner) {
                    console.log(`❌ Not authorized for /setbuyer. Username: ${interaction.user.username}`);
                    return interaction.reply({ content: '❌ Command ini hanya bisa digunakan oleh owner (tc_comunity)!', ephemeral: true });
                }
                await handleSetBuyerPanel(interaction);
            } else if (commandName === 'redeem') {
                console.log(`🎟️ Processing /redeem slash command`);
                await handleRedeemCommand(interaction);
            } else if (commandName === 'getstatus') {
                console.log(`📊 Processing /getstatus slash command`);
                await handleGetStatusCommand(interaction);
            } else if (commandName === 'requestpt') {
                console.log(`🤝 Processing /requestpt slash command - Partner Setup`);
                const isAuthorized = interaction.user.username === config.allowedUsername || 
                                    interaction.user.id === config.developmentUserId;
                if (!isAuthorized) {
                    return interaction.reply({ content: '❌ Command ini hanya bisa digunakan oleh admin!', ephemeral: true });
                }
                await handlePartnerSetupSlash(interaction);
            } else if (commandName === 'help') {
                const helpEmbed = new EmbedBuilder()
                    .setTitle('📋 Daftar Command Bot Valuamor')
                    .setDescription('Berikut adalah daftar command yang tersedia:')
                    .setColor(0x5865F2)
                    .addFields(
                        { name: '🔓 Public Commands', value: '`/development` atau `!development` - Panel setup development (public)\n`/development2` atau `!development2` - Panel setup development2 (public)\n`/help` atau `!help` atau `!commands` - Menampilkan command list\n`/getstatus` - Cek status premium Anda\n`!requestpt` - Panel request partner', inline: false },
                        { name: '🔒 Owner Only Commands', value: '`/buybot` atau `!buybot` - Informasi pembelian bot\n`/redemkode` atau `!redemkode` - Generate redeem code otomatis', inline: false },
                        { name: '🔑 Admin/Development Only', value: '`/buatkey` atau `!buatkey` - Panel buat key development\n`/len` atau `!LEN` - Edit status panel (pilih panel dari list)\n`/setbuyer` - Set premium buyer dengan durasi (Dev ID only)\n`/requestpt` atau `!partnerset` - Setup partner system', inline: false }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Valuamor Bot System' });
                
                await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
            }
        } catch (error) {
            console.error('Error handling slash command:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ Terjadi kesalahan!', ephemeral: true });
            }
        }
        return;
    }
    
    if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

    try {
        if (interaction.customId.startsWith('development_') || interaction.customId.startsWith('development2_')) {
            await handleDevelopmentInteraction(interaction);
        } else if (interaction.customId.startsWith('buybot_')) {
            await handleBuyBotInteraction(interaction);
        } else if (interaction.customId.startsWith('redeem_')) {
            await handleRedeemInteraction(interaction);
        } else if (interaction.customId.startsWith('createkey_')) {
            await handleCreateKeyInteraction(interaction);
        } else if (interaction.customId.startsWith('panel_')) {
            await handlePanelUserInteraction(interaction);
        } else if (interaction.customId.startsWith('len_')) {
            await handleLENInteraction(interaction);
        } else if (interaction.customId.startsWith('setbuyer_')) {
            await handleSetBuyerInteraction(interaction);
        } else if (interaction.customId.startsWith('partner_')) {
            await handlePartnerRequestInteraction(interaction);
        } else if (interaction.customId.startsWith('partnerreview_')) {
            await handlePartnerReviewInteraction(interaction);
        } else if (interaction.customId.startsWith('partnerset_')) {
            await handlePartnerSetInteraction(interaction);
        }
    } catch (error) {
        console.error('Error handling interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Terjadi kesalahan!', ephemeral: true });
        }
    }
});

async function handleDevelopmentInteraction(interaction) {
    const panelType = interaction.customId.startsWith('development2_') ? 'development2' : 'development';
    const action = interaction.customId.split('_')[1];

    if (action === 'setchannel') {
        const channels = interaction.guild.channels.cache
            .filter(ch => ch.type === ChannelType.GuildText)
            .first(25);

        const options = channels.map(ch => ({
            label: ch.name,
            value: ch.id,
            description: `ID: ${ch.id}`
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`${panelType}_selectchannel`)
            .setPlaceholder('Pilih channel untuk panel')
            .addOptions(options);

        const row = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.reply({ content: '📢 Pilih channel:', components: [row], ephemeral: true });
    }

    else if (action === 'selectchannel') {
        const channelId = interaction.values[0];
        if (!database.panels[panelType]) database.panels[panelType] = {};
        database.panels[panelType].channelId = channelId;
        saveDatabase(database);
        await interaction.update({ content: `✅ Channel berhasil diset ke <#${channelId}>`, components: [] });
    }

    else if (action === 'setdesc') {
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
        const modal = new ModalBuilder()
            .setCustomId(`${panelType}_modaldesc`)
            .setTitle('Set Deskripsi Panel');

        const descInput = new TextInputBuilder()
            .setCustomId('description')
            .setLabel('Deskripsi')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Masukkan deskripsi panel...')
            .setRequired(true);

        const firstRow = new ActionRowBuilder().addComponents(descInput);
        modal.addComponents(firstRow);
        await interaction.showModal(modal);
    }

    else if (action === 'modaldesc') {
        const description = interaction.fields.getTextInputValue('description');
        if (!database.panels[panelType]) database.panels[panelType] = {};
        database.panels[panelType].description = description;
        saveDatabase(database);
        await interaction.reply({ content: '✅ Deskripsi berhasil diset!', ephemeral: true });
    }

    else if (action === 'settitle') {
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
        const modal = new ModalBuilder()
            .setCustomId(`${panelType}_modaltitle`)
            .setTitle('Set Judul Panel');

        const titleInput = new TextInputBuilder()
            .setCustomId('title')
            .setLabel('Judul')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Masukkan judul panel...')
            .setRequired(true);

        const firstRow = new ActionRowBuilder().addComponents(titleInput);
        modal.addComponents(firstRow);
        await interaction.showModal(modal);
    }

    else if (action === 'modaltitle') {
        const title = interaction.fields.getTextInputValue('title');
        if (!database.panels[panelType]) database.panels[panelType] = {};
        database.panels[panelType].title = title;
        saveDatabase(database);
        await interaction.reply({ content: '✅ Judul berhasil diset!', ephemeral: true });
    }

    else if (action === 'setscript') {
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
        const modal = new ModalBuilder()
            .setCustomId(`${panelType}_modalscript`)
            .setTitle('Set Script Roblox Executor');

        const scriptInput = new TextInputBuilder()
            .setCustomId('script')
            .setLabel('Script')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Masukkan script roblox executor...')
            .setRequired(true);

        const firstRow = new ActionRowBuilder().addComponents(scriptInput);
        modal.addComponents(firstRow);
        await interaction.showModal(modal);
    }

    else if (action === 'modalscript') {
        const script = interaction.fields.getTextInputValue('script');
        if (!database.panels[panelType]) database.panels[panelType] = {};
        database.panels[panelType].script = script;
        saveDatabase(database);
        await interaction.reply({ content: '✅ Script berhasil diset!', ephemeral: true });
    }

    else if (action === 'setrole') {
        const roles = interaction.guild.roles.cache
            .filter(r => r.name !== '@everyone')
            .first(25);

        const options = roles.map(r => ({
            label: r.name,
            value: r.id,
            description: `ID: ${r.id}`
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`${panelType}_selectrole`)
            .setPlaceholder('Pilih role yang diperlukan')
            .addOptions(options);

        const row = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.reply({ content: '👥 Pilih role:', components: [row], ephemeral: true });
    }

    else if (action === 'selectrole') {
        const roleId = interaction.values[0];
        if (!database.panels[panelType]) database.panels[panelType] = {};
        database.panels[panelType].requiredRole = roleId;
        saveDatabase(database);
        await interaction.update({ content: `✅ Role berhasil diset ke <@&${roleId}>`, components: [] });
    }

    else if (action === 'setstatus') {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`${panelType}_selectstatus`)
            .setPlaceholder('Pilih status')
            .addOptions([
                { label: 'Active', value: 'active' },
                { label: 'Banned', value: 'banned' },
                { label: 'Maintenance', value: 'maintenance' },
                { label: 'Down', value: 'down' },
                { label: 'Blacklist', value: 'blacklist' }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.reply({ content: '⚙️ Pilih status:', components: [row], ephemeral: true });
    }

    else if (action === 'selectstatus') {
        const status = interaction.values[0];
        if (!database.panels[panelType]) database.panels[panelType] = {};
        database.panels[panelType].status = status;
        saveDatabase(database);

        const panelData = database.panels[panelType];
        if (panelData.messageId && panelData.channelId) {
            try {
                const channel = interaction.guild.channels.cache.get(panelData.channelId);
                if (channel) {
                    const message = await channel.messages.fetch(panelData.messageId);
                    const updatedEmbed = createPanelEmbed(panelData, panelType);
                    const updatedButtons = createPanelButtons(panelType, status);
                    await message.edit({ embeds: [updatedEmbed], components: updatedButtons });
                    await interaction.update({ content: `✅ Status berhasil diset ke: ${status} dan panel telah diupdate!`, components: [] });
                } else {
                    await interaction.update({ content: `✅ Status berhasil diset ke: ${status}`, components: [] });
                }
            } catch (error) {
                console.error('Error updating panel message:', error);
                await interaction.update({ content: `✅ Status berhasil diset ke: ${status} (Panel message tidak ditemukan)`, components: [] });
            }
        } else {
            await interaction.update({ content: `✅ Status berhasil diset ke: ${status}`, components: [] });
        }
    }

    else if (action === 'preview') {
        const panelData = database.panels[panelType];
        if (!panelData || !panelData.title) {
            return interaction.reply({ content: '❌ Panel belum dikonfigurasi dengan lengkap!', ephemeral: true });
        }

        const currentStatus = panelData.status || 'active';
        const previewEmbed = createPanelEmbed(panelData, panelType);
        const buttons = createPanelButtons(panelType, currentStatus);
        await interaction.reply({ embeds: [previewEmbed], components: buttons, ephemeral: true });
    }

    else if (action === 'send') {
        const panelData = database.panels[panelType];
        if (!panelData || !panelData.title || !panelData.channelId) {
            return interaction.reply({ content: '❌ Panel belum dikonfigurasi dengan lengkap! Pastikan sudah set channel dan title.', ephemeral: true });
        }

        const channel = interaction.guild.channels.cache.get(panelData.channelId);
        if (!channel) {
            return interaction.reply({ content: '❌ Channel tidak ditemukan!', ephemeral: true });
        }

        const currentStatus = panelData.status || 'active';
        const panelEmbed = createPanelEmbed(panelData, panelType);
        const buttons = createPanelButtons(panelType, currentStatus);

        console.log(`🚀 Sending panel to channel: ${channel.name} (${panelData.channelId})`);
        
        try {
            const sentMessage = await channel.send({ embeds: [panelEmbed], components: buttons });

            if (!database.panels[panelType]) database.panels[panelType] = {};
            database.panels[panelType].messageId = sentMessage.id;
            if (!database.panels[panelType].status) {
                database.panels[panelType].status = 'active';
            }
            saveDatabase(database);

            if (interaction.isRepliable()) {
                await interaction.reply({ content: `✅ Panel berhasil dikirim ke <#${panelData.channelId}>!`, ephemeral: true });
            }
        } catch (sendError) {
            console.error('❌ Failed to send message to channel:', sendError);
            if (interaction.isRepliable()) {
                if (sendError.code === 50013) {
                    await interaction.reply({ 
                        content: '❌ Bot tidak punya permission (Send Messages/Embed Links) di channel tersebut! Cek setting channel/role bot.', 
                        ephemeral: true 
                    });
                } else {
                    await interaction.reply({ 
                        content: `❌ Gagal mengirim panel: ${sendError.message}`, 
                        ephemeral: true 
                    });
                }
            }
        }
    }
}

function createPanelEmbed(panelData, panelType) {
    let embedColor = 0x5865F2;
    let statusEmoji = '✅';
    let statusText = 'ACTIVE';

    if (panelData.status) {
        statusText = panelData.status.toUpperCase();
        switch (panelData.status) {
            case 'active':
                embedColor = 0x57F287;
                statusEmoji = '✅';
                break;
            case 'banned':
            case 'blacklist':
                embedColor = 0xED4245;
                statusEmoji = '🔨';
                break;
            case 'maintenance':
                embedColor = 0xFEE75C;
                statusEmoji = '⚠️';
                break;
            case 'down':
                embedColor = 0x99AAB5;
                statusEmoji = '⬇️';
                break;
        }
    }

    const embed = new EmbedBuilder()
        .setTitle(panelData.title || 'Valuamor Control Panel')
        .setDescription(panelData.description || 'This control panel is for the project: Valuamor\n\n🔑 **Redeem Key**: Tersedia untuk semua user\n⭐ **Get Script & Get Role**: Hanya untuk **PREMIUM USERS**\n\n*Gunakan `/getstatus` untuk cek status premium Anda*')
        .setColor(embedColor)
        .setImage('https://cdn.discordapp.com/attachments/1441807323512438795/1456621144466522185/DEV_PANEL_20260101_105726_0000.png?ex=695907a7&is=6957b627&hm=47f4941989d2233280897eb3a62bccf65f5de49a28c77c3375e40a1912dd31c7&')
        .setTimestamp()
        .setFooter({ text: `Valuamor Bot System | ${new Date().toLocaleString()}` });

    if (panelData.status) {
        embed.addFields({ name: 'Status', value: `${statusEmoji} ${statusText}`, inline: true });
    }

    return embed;
}

function createPanelButtons(panelType, status = 'active') {
    const isDisabled = status !== 'active';

    let buttonStyle1 = ButtonStyle.Success;
    let buttonStyle2 = ButtonStyle.Primary;
    let buttonStyle3 = ButtonStyle.Secondary;

    if (status === 'banned' || status === 'blacklist') {
        buttonStyle1 = ButtonStyle.Danger;
        buttonStyle2 = ButtonStyle.Danger;
        buttonStyle3 = ButtonStyle.Danger;
    } else if (status === 'maintenance') {
        buttonStyle1 = ButtonStyle.Secondary;
        buttonStyle2 = ButtonStyle.Secondary;
        buttonStyle3 = ButtonStyle.Secondary;
    } else if (status === 'down') {
        buttonStyle1 = ButtonStyle.Secondary;
        buttonStyle2 = ButtonStyle.Secondary;
        buttonStyle3 = ButtonStyle.Secondary;
    }

    const row1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`panel_${panelType}_redeemkey`)
                .setLabel('Redeem Key')
                .setStyle(buttonStyle1)
                .setEmoji('🔑')
                .setDisabled(isDisabled),
            new ButtonBuilder()
                .setCustomId(`panel_${panelType}_getscript`)
                .setLabel('Get Script')
                .setStyle(buttonStyle2)
                .setEmoji('📜')
                .setDisabled(isDisabled),
            new ButtonBuilder()
                .setCustomId(`panel_${panelType}_getrole`)
                .setLabel('Get Role')
                .setStyle(buttonStyle2)
                .setEmoji('👥')
                .setDisabled(isDisabled)
        );

    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`panel_${panelType}_resethwid`)
                .setLabel('Reset HWID')
                .setStyle(buttonStyle3)
                .setEmoji('⚙️')
                .setDisabled(isDisabled),
            new ButtonBuilder()
                .setCustomId(`panel_${panelType}_getstats`)
                .setLabel('Get Stats')
                .setStyle(buttonStyle3)
                .setEmoji('📊')
                .setDisabled(isDisabled)
        );

    return [row1, row2];
}

async function handlePanelUserInteraction(interaction) {
    const parts = interaction.customId.split('_');
    const panelType = parts[1];
    const action = parts[2];

    const panelData = database.panels[panelType];
    if (!panelData) {
        return interaction.reply({ content: '❌ Panel tidak ditemukan!', ephemeral: true });
    }

    const userId = interaction.user.id;

    if (action === 'redeemkey') {
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
        const modal = new ModalBuilder()
            .setCustomId(`panel_${panelType}_modalredeem`)
            .setTitle('Redeem Key');

        const keyInput = new TextInputBuilder()
            .setCustomId('redeemcode')
            .setLabel('Kode Redeem')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Masukkan kode redeem (Valuamor-xxx-xxx)')
            .setRequired(true);

        const firstRow = new ActionRowBuilder().addComponents(keyInput);
        modal.addComponents(firstRow);
        await interaction.showModal(modal);
    }

    else if (action === 'modalredeem') {
        const code = interaction.fields.getTextInputValue('redeemcode');
        const redeemData = database.redeemCodes[code];

        if (!redeemData) {
            return interaction.reply({ content: '❌ Kode tidak valid!', ephemeral: true });
        }

        if (redeemData.used && redeemData.rank === 'buyer') {
            return interaction.reply({ content: '❌ Kode ini sudah digunakan!', ephemeral: true });
        }

        const userId = interaction.user.id;
        const guildId = interaction.guild.id;

        if (redeemData.rank === 'buyer') {
            if (redeemData.usedBy && redeemData.usedBy !== userId) {
                return interaction.reply({ content: '❌ Kode ini sudah digunakan oleh user lain!', ephemeral: true });
            }
            if (redeemData.usedInGuild && redeemData.usedInGuild !== guildId) {
                return interaction.reply({ content: '❌ Kode ini sudah digunakan di server lain!', ephemeral: true });
            }
        }

        const key = generateKey();
        database.userKeys[userId] = {
            key: key,
            rank: redeemData.rank,
            duration: redeemData.duration,
            redeemedAt: Date.now(),
            guildId: guildId,
            script: panelData.script || 'loadstring(game:HttpGet("https://example.com/script.lua"))()',
            panelType: panelType
        };

        if (redeemData.rank === 'buyer') {
            database.redeemCodes[code].used = true;
            database.redeemCodes[code].usedBy = userId;
            database.redeemCodes[code].usedInGuild = guildId;
        }

        saveDatabase(database);

        const isPremiumUser = isPremiumActive(userId);
        const premiumBadge = isPremiumUser ? '\n⭐ **PREMIUM USER**' : '';
        const embed = new EmbedBuilder()
            .setTitle('✅ Key Berhasil Diredeem!')
            .setDescription(`**Key:** \`${key}\`\n**Rank:** ${redeemData.rank}\n**Durasi:** ${redeemData.duration}${premiumBadge}`)
            .setColor(isPremiumUser ? 0xFFD700 : 0x57F287)
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    else if (action === 'getscript') {
        const member = interaction.member;
        const hasRequiredRole = panelData.requiredRole && member.roles.cache.has(panelData.requiredRole);
        const isPremium = isPremiumActive(userId);

        if (!isPremium && !hasRequiredRole) {
            const embed = new EmbedBuilder()
                .setTitle('🔒 Access Denied / Akses Ditolak')
                .setDescription('You must have a **Specific Role** or **Premium** status to get the script! / Anda harus memiliki **Role Khusus** atau status **Premium** untuk mengambil script!')
                .setColor(0xFF0000)
                .addFields(
                    { name: '❌ Status', value: 'Locked / Terkunci', inline: true },
                    { name: '📞 Solution / Solusi', value: 'Contact admin for role or premium / Hubungi admin untuk role atau premium', inline: true }
                )
                .setTimestamp();
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        // If they have the role but no key/script yet, we can auto-assign one or just use a default script
        let userKey = database.userKeys[userId];
        
        if (!userKey || !userKey.script) {
            // Auto-assign default script if they have the role but no key
            if (hasRequiredRole) {
                const key = generateKey();
                database.userKeys[userId] = {
                    key: key,
                    rank: 'Role Access',
                    duration: 'Permanent (Role)',
                    redeemedAt: Date.now(),
                    guildId: interaction.guild.id,
                    script: panelData.script || 'loadstring(game:HttpGet("https://example.com/script.lua"))()',
                    panelType: panelType
                };
                saveDatabase(database);
                userKey = database.userKeys[userId];
            } else {
                return interaction.reply({ 
                    content: '❌ Anda tidak memiliki script! Silakan redeem key terlebih dahulu.', 
                    ephemeral: true 
                });
            }
        }

        const premiumBadge = isPremium ? '\n⭐ **PREMIUM USER**' : '\n✅ **ROLE ACCESS VERIFIED / AKSES ROLE TERVERIFIKASI**';
        const remainingTime = isPremium ? getRemainingTime(userId) : 'Permanent (Role Based)';
        const embed = new EmbedBuilder()
            .setTitle('📜 Your Script / Script Anda')
            .setDescription(`Your script is ready! / Script Anda telah disiapkan!${premiumBadge}`)
            .setColor(isPremium ? 0xFFD700 : 0x5865F2)
            .setImage('https://cdn.discordapp.com/attachments/1441807323512438795/1456621144944808100/Dark_Simple_Photo_Virtual_Meeting_Zoom_Virtual_Background_20251231_205444_0000.png?ex=695907a7&is=6957b627&hm=84c5bc0a2c52859259c56e0244c5611b74525e08ec8e1cec5d427a8fa3c3a3d3&')
            .addFields(
                { name: 'Script', value: `\`\`\`lua\n${userKey.script}\n\`\`\``, inline: false },
                { name: 'Status', value: isPremium ? '⭐ Premium Active' : '✅ Role Active', inline: true },
                { name: 'Active Time / Masa Aktif', value: remainingTime, inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'Script is ready to use / Script siap digunakan | Access verified' });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    else if (action === 'getrole') {
        if (!panelData.requiredRole) {
            return interaction.reply({ content: '❌ Role belum diset!', ephemeral: true });
        }

        if (!isPremiumActive(userId)) {
            const embed = new EmbedBuilder()
                .setTitle('🔒 Premium Required')
                .setDescription('Premium Anda sudah **expired** atau belum aktif!')
                .setColor(0xFF0000)
                .addFields(
                    { name: '❌ Status', value: 'Premium Expired/Inactive', inline: true },
                    { name: '📞 Solusi', value: 'Hubungi admin untuk perpanjang premium', inline: true }
                )
                .setTimestamp();
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const member = interaction.member;
        const guildId = interaction.guild.id;

        if (member.roles.cache.has(panelData.requiredRole)) {
            const remainingTime = getRemainingTime(userId);
            return interaction.reply({ 
                content: `✅ Anda sudah memiliki role ini!\n⭐ **PREMIUM USER** (${remainingTime})`, 
                ephemeral: true 
            });
        }

        const userKey = database.userKeys[userId];
        if (!userKey) {
            return interaction.reply({ 
                content: '❌ Anda belum memiliki akses! Silakan redeem key terlebih dahulu.', 
                ephemeral: true 
            });
        }

        if (userKey.rank === 'buyer' && userKey.guildId !== guildId) {
            return interaction.reply({ 
                content: '❌ Key Anda terdaftar di server lain! Key buyer hanya bisa digunakan di satu server.', 
                ephemeral: true 
            });
        }

        try {
            await member.fetch();
            await member.roles.add(panelData.requiredRole);
            const remainingTime = getRemainingTime(userId);
            await interaction.reply({ 
                content: `✅ Role <@&${panelData.requiredRole}> berhasil diberikan kepada Anda!\n⭐ **PREMIUM USER** (Aktif: ${remainingTime})`, 
                ephemeral: true 
            });
        } catch (error) {
            console.error('Error adding role:', error);
            await interaction.reply({ 
                content: '❌ Gagal memberikan role! Pastikan bot memiliki permission yang cukup dan role bot lebih tinggi dari role yang diberikan.', 
                ephemeral: true 
            });
        }
    }

    else if (action === 'resethwid') {
        const userId = interaction.user.id;
        if (database.hwids[userId]) {
            delete database.hwids[userId];
            saveDatabase(database);
            await interaction.reply({ content: '✅ HWID berhasil direset!', ephemeral: true });
        } else {
            await interaction.reply({ content: '❌ Anda belum memiliki HWID yang tersimpan!', ephemeral: true });
        }
    }

    else if (action === 'getstats') {
        const userKey = database.userKeys[userId];

        if (!userKey) {
            return interaction.reply({ content: '❌ Anda belum memiliki key!', ephemeral: true });
        }

        const isPremiumUser = isPremiumActive(userId);
        const premiumStatus = isPremiumUser ? '⭐ Premium' : '🔓 Standard';
        const premiumTime = getRemainingTime(userId) || 'Non-Premium';
        
        const embedTitle = isPremiumUser ? '📊 Valuamor Stats Premium' : '📊 Valuamor Stats';
        const embedColor = isPremiumUser ? 0xFFD700 : 0x5865F2;
        
        const embed = new EmbedBuilder()
            .setTitle(embedTitle)
            .setDescription(isPremiumUser ? '⭐ **PREMIUM USER**' : 'Standard User')
            .addFields(
                { name: 'Key', value: `\`${userKey.key}\``, inline: false },
                { name: 'Rank', value: userKey.rank, inline: true },
                { name: 'Duration', value: userKey.duration, inline: true },
                { name: 'Premium Status', value: premiumStatus, inline: true },
                { name: 'Premium Time', value: premiumTime, inline: true },
                { name: 'Redeemed At', value: new Date(userKey.redeemedAt).toLocaleString(), inline: false }
            )
            .setColor(embedColor)
            .setTimestamp();
        
        if (isPremiumUser && interaction.guild) {
            const guildIconURL = interaction.guild.iconURL({ dynamic: true, size: 256 });
            if (guildIconURL) {
                embed.setThumbnail(guildIconURL);
            }
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

async function handleBuyBotInteraction(interaction) {
    const action = interaction.customId.split('_')[1];

    if (action === 'addaccess') {
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
        const modal = new ModalBuilder()
            .setCustomId('buybot_modaladdaccess')
            .setTitle('Tambah Akses User');

        const userInput = new TextInputBuilder()
            .setCustomId('userid')
            .setLabel('User ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Masukkan User ID...')
            .setRequired(true);

        const durationInput = new TextInputBuilder()
            .setCustomId('duration')
            .setLabel('Durasi')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Contoh: 30 days, lifetime')
            .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(userInput);
        const row2 = new ActionRowBuilder().addComponents(durationInput);
        modal.addComponents(row1, row2);
        await interaction.showModal(modal);
    }

    else if (action === 'modaladdaccess') {
        const userId = interaction.fields.getTextInputValue('userid');
        const duration = interaction.fields.getTextInputValue('duration');

        if (!database.userKeys[userId]) {
            database.userKeys[userId] = {};
        }

        database.userKeys[userId].accessGranted = true;
        database.userKeys[userId].duration = duration;
        database.userKeys[userId].grantedAt = Date.now();
        database.userKeys[userId].grantedBy = interaction.user.id;
        saveDatabase(database);

        await interaction.reply({ content: `✅ Akses berhasil ditambahkan untuk user <@${userId}>!`, ephemeral: true });
    }

    else if (action === 'removeaccess') {
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
        const modal = new ModalBuilder()
            .setCustomId('buybot_modalremoveaccess')
            .setTitle('Hapus Akses User');

        const userInput = new TextInputBuilder()
            .setCustomId('userid')
            .setLabel('User ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Masukkan User ID...')
            .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(userInput);
        modal.addComponents(row1);
        await interaction.showModal(modal);
    }

    else if (action === 'modalremoveaccess') {
        const userId = interaction.fields.getTextInputValue('userid');

        if (database.userKeys[userId]) {
            delete database.userKeys[userId];
            saveDatabase(database);
            await interaction.reply({ content: `✅ Akses berhasil dihapus untuk user <@${userId}>!`, ephemeral: true });
        } else {
            await interaction.reply({ content: '❌ User tidak memiliki akses!', ephemeral: true });
        }
    }

    else if (action === 'listaccess') {
        const users = Object.entries(database.userKeys);
        if (users.length === 0) {
            return interaction.reply({ content: '❌ Belum ada user yang memiliki akses!', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('📋 List User Access')
            .setColor(0x5865F2)
            .setTimestamp();

        let description = '';
        users.slice(0, 10).forEach(([userId, data]) => {
            description += `\n<@${userId}> - ${data.rank || 'N/A'} - ${data.duration || 'N/A'}`;
        });

        embed.setDescription(description || 'Tidak ada data');
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

async function handleRedeemInteraction(interaction) {
    const action = interaction.customId.split('_')[1];

    if (action === 'create') {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('redeem_selectrank')
            .setPlaceholder('Pilih rank untuk kode redeem')
            .addOptions([
                { label: 'Buyer', value: 'buyer', description: 'Kode sekali pakai', emoji: '👤' },
                { label: 'Development', value: 'development', description: 'Unlimited use', emoji: '🛠️' },
                { label: 'Staff', value: 'staff', description: 'Unlimited use', emoji: '👨‍💼' },
                { label: 'Service Provider', value: 'provider', description: 'Unlimited use', emoji: '🔧' },
                { label: 'Meytic', value: 'meytic', description: 'Unlimited use', emoji: '⚡' },
                { label: 'Hack', value: 'hack', description: 'Unlimited use', emoji: '💻' }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.reply({ content: '🎟️ Pilih rank:', components: [row], ephemeral: true });
    }

    else if (action === 'selectrank') {
        const rank = interaction.values[0];
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
        const modal = new ModalBuilder()
            .setCustomId(`redeem_modalcreate_${rank}`)
            .setTitle(`Buat Kode Redeem - ${rank}`);

        const durationInput = new TextInputBuilder()
            .setCustomId('duration')
            .setLabel('Durasi')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Contoh: 30 days, lifetime')
            .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(durationInput);
        modal.addComponents(row1);
        await interaction.showModal(modal);
    }

    else if (action === 'modalcreate') {
        const rank = interaction.customId.split('_')[2];
        const duration = interaction.fields.getTextInputValue('duration');

        const code = generateRedeemCode();
        database.redeemCodes[code] = {
            rank: rank,
            duration: duration,
            used: false,
            createdAt: Date.now(),
            createdBy: interaction.user.id
        };
        saveDatabase(database);

        const embed = new EmbedBuilder()
            .setTitle('✅ Kode Redeem Berhasil Dibuat!')
            .setDescription(`**Kode:** \`${code}\`\n**Rank:** ${rank}\n**Durasi:** ${duration}`)
            .setColor(0x57F287)
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    else if (action === 'list') {
        const codes = Object.entries(database.redeemCodes);
        if (codes.length === 0) {
            return interaction.reply({ content: '❌ Belum ada kode redeem!', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('📋 List Redeem Codes')
            .setColor(0x5865F2)
            .setTimestamp();

        let description = '';
        codes.slice(0, 10).forEach(([code, data]) => {
            const status = data.used ? '❌ Used' : '✅ Available';
            description += `\n\`${code}\` - ${data.rank} - ${data.duration} - ${status}`;
        });

        embed.setDescription(description);
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    else if (action === 'delete') {
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
        const modal = new ModalBuilder()
            .setCustomId('redeem_modaldelete')
            .setTitle('Hapus Kode Redeem');

        const codeInput = new TextInputBuilder()
            .setCustomId('code')
            .setLabel('Kode')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Masukkan kode redeem...')
            .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(codeInput);
        modal.addComponents(row1);
        await interaction.showModal(modal);
    }

    else if (action === 'modaldelete') {
        const code = interaction.fields.getTextInputValue('code');

        if (database.redeemCodes[code]) {
            delete database.redeemCodes[code];
            saveDatabase(database);
            await interaction.reply({ content: `✅ Kode \`${code}\` berhasil dihapus!`, ephemeral: true });
        } else {
            await interaction.reply({ content: '❌ Kode tidak ditemukan!', ephemeral: true });
        }
    }
}

async function handleCreateKeyInteraction(interaction) {
    const action = interaction.customId.split('_')[1];

    if (action === 'start') {
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
        const modal = new ModalBuilder()
            .setCustomId('createkey_modalrole')
            .setTitle('Buat Key Development');

        const roleInput = new TextInputBuilder()
            .setCustomId('rolename')
            .setLabel('Nama Role')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Masukkan nama role khusus (contoh: VIP, Premium, etc)')
            .setRequired(true);

        const playerIdInput = new TextInputBuilder()
            .setCustomId('playerid')
            .setLabel('Player ID / User ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Masukkan Player ID atau User ID Discord')
            .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(roleInput);
        const row2 = new ActionRowBuilder().addComponents(playerIdInput);
        modal.addComponents(row1, row2);
        await interaction.showModal(modal);
    }

    else if (action === 'modalrole') {
        const roleName = interaction.fields.getTextInputValue('rolename');
        const playerId = interaction.fields.getTextInputValue('playerid');

        const embed = new EmbedBuilder()
            .setTitle('🔑 Konfirmasi Pembuatan Key')
            .setDescription(`**Role:** ${roleName}\n**Player ID:** ${playerId}\n\n**Apakah key bisa dipakai berulang?**`)
            .setColor(0x5865F2)
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`createkey_confirm_yes_${roleName}_${playerId}`)
                    .setLabel('YES - Unlimited Use')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('♾️'),
                new ButtonBuilder()
                    .setCustomId(`createkey_confirm_no_${roleName}_${playerId}`)
                    .setLabel('NO - Single Use Only')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('1️⃣')
            );

        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    else if (action === 'confirm') {
        const parts = interaction.customId.split('_');
        const unlimited = parts[2] === 'yes';
        const roleName = parts[3];
        const playerId = parts[4];

        const key = generateDevKey();

        if (!database.developmentKeys) {
            database.developmentKeys = {};
        }

        database.developmentKeys[key] = {
            role: roleName,
            playerId: playerId,
            unlimited: unlimited,
            used: false,
            usedBy: null,
            createdAt: Date.now(),
            createdBy: interaction.user.id
        };
        saveDatabase(database);

        const embed = new EmbedBuilder()
            .setTitle('✅ Key Development Berhasil Dibuat!')
            .setDescription(`**Key:** \`${key}\`\n**Role:** ${roleName}\n**Player ID:** ${playerId}\n**Type:** ${unlimited ? '♾️ Unlimited Use' : '1️⃣ Single Use Only'}\n**Status:** ✅ Active`)
            .setColor(0x57F287)
            .setTimestamp()
            .setFooter({ text: `Created by ${interaction.user.tag}` });

        await interaction.update({ embeds: [embed], components: [] });
    }

    else if (action === 'list') {
        const keys = Object.entries(database.developmentKeys || {});
        if (keys.length === 0) {
            return interaction.reply({ content: '❌ Belum ada key development yang dibuat!', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('📋 List Development Keys')
            .setColor(0x5865F2)
            .setTimestamp();

        let description = '';
        keys.slice(0, 15).forEach(([key, data]) => {
            const status = data.used ? '❌ Used' : '✅ Active';
            const type = data.unlimited ? '♾️ Unlimited' : '1️⃣ Single';
            description += `\n\`${key}\`\nRole: ${data.role} | Player: ${data.playerId} | ${type} | ${status}\n`;
        });

        embed.setDescription(description || 'Tidak ada data');
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    else if (action === 'delete') {
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
        const modal = new ModalBuilder()
            .setCustomId('createkey_modaldelete')
            .setTitle('Hapus Development Key');

        const keyInput = new TextInputBuilder()
            .setCustomId('keycode')
            .setLabel('Key Code')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Masukkan key yang ingin dihapus...')
            .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(keyInput);
        modal.addComponents(row1);
        await interaction.showModal(modal);
    }

    else if (action === 'modaldelete') {
        const keyCode = interaction.fields.getTextInputValue('keycode');

        if (database.developmentKeys && database.developmentKeys[keyCode]) {
            delete database.developmentKeys[keyCode];
            saveDatabase(database);
            await interaction.reply({ content: `✅ Key \`${keyCode}\` berhasil dihapus!`, ephemeral: true });
        } else {
            await interaction.reply({ content: '❌ Key tidak ditemukan!', ephemeral: true });
        }
    }
}

async function handleLENInteraction(interaction) {
    const action = interaction.customId.split('_')[1];

    if (action === 'selectpanel') {
        const panelType = interaction.values[0];
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`len_setstatus_${panelType}`)
            .setPlaceholder('Pilih status baru')
            .addOptions([
                { label: 'Active', value: 'active' },
                { label: 'Banned', value: 'banned' },
                { label: 'Maintenance', value: 'maintenance' },
                { label: 'Down', value: 'down' },
                { label: 'Blacklist', value: 'blacklist' }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.update({ content: `⚙️ Pilih status untuk panel: **${database.panels[panelType]?.title || panelType}**`, components: [row] });
    }

    else if (action === 'setstatus') {
        const parts = interaction.customId.split('_');
        const panelType = parts[2];
        const status = interaction.values[0];

        if (!database.panels[panelType]) {
            return interaction.update({ content: '❌ Panel tidak ditemukan!', components: [] });
        }

        database.panels[panelType].status = status;
        saveDatabase(database);

        const panelData = database.panels[panelType];
        if (panelData.messageId && panelData.channelId) {
            try {
                const channel = interaction.guild.channels.cache.get(panelData.channelId);
                if (channel) {
                    const message = await channel.messages.fetch(panelData.messageId);
                    const updatedEmbed = createPanelEmbed(panelData, panelType);
                    const updatedButtons = createPanelButtons(panelType, status);
                    await message.edit({ embeds: [updatedEmbed], components: updatedButtons });
                    await interaction.update({ content: `✅ Status panel **${panelData.title}** berhasil diubah ke: **${status.toUpperCase()}** dan panel telah diupdate!`, components: [] });
                } else {
                    await interaction.update({ content: `✅ Status berhasil diset ke: **${status.toUpperCase()}** (Channel tidak ditemukan)`, components: [] });
                }
            } catch (error) {
                console.error('Error updating panel message:', error);
                await interaction.update({ content: `✅ Status berhasil diset ke: **${status.toUpperCase()}** (Panel message tidak ditemukan)`, components: [] });
            }
        } else {
            await interaction.update({ content: `✅ Status berhasil diset ke: **${status.toUpperCase()}**`, components: [] });
        }
    }
}

function generateRedeemCode() {
    const part1 = Math.random().toString(36).substring(2, 5).toUpperCase();
    const part2 = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `Valuamor-${part1}-${part2}`;
}

function generateKey() {
    return 'KEY-' + Math.random().toString(36).substring(2, 15).toUpperCase();
}

function generateDevKey() {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `DEV-${timestamp}-${random}`;
}

async function handleSetBuyerPanel(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('💎 Valuamor - Set Premium Buyer')
        .setDescription('Pilih aksi yang ingin Anda lakukan:')
        .setColor(0xFFD700)
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('setbuyer_newuser')
                .setLabel('Tambah User Baru')
                .setStyle(ButtonStyle.Success)
                .setEmoji('➕'),
            new ButtonBuilder()
                .setCustomId('setbuyer_extend')
                .setLabel('Perpanjang User')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔄'),
            new ButtonBuilder()
                .setCustomId('setbuyer_list')
                .setLabel('List Premium Users')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📋'),
            new ButtonBuilder()
                .setCustomId('setbuyer_remove')
                .setLabel('Hapus Premium')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️')
        );

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

async function handleGetStatusCommand(interaction) {
    const userId = interaction.user.id;
    const isPremium = isPremiumActive(userId);
    
    if (!isPremium) {
        const embed = new EmbedBuilder()
            .setTitle('📊 Status Premium Anda')
            .setDescription('❌ Anda **belum memiliki** akses premium!')
            .setColor(0xFF0000)
            .addFields(
                { name: 'Status', value: '🔒 Non-Premium', inline: true },
                { name: 'Akses Panel', value: 'Tidak Aktif', inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'Hubungi admin untuk mendapatkan akses premium' });
        
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    const remaining = getRemainingTime(userId);
    const buyer = database.premiumBuyers[userId];
    const addedDate = buyer.addedDate ? new Date(buyer.addedDate).toLocaleDateString('id-ID') : 'Unknown';
    const grantedBy = buyer.grantedBy || 'System';
    
    const embed = new EmbedBuilder()
        .setTitle('📊 Status Premium Anda')
        .setDescription('✅ Anda memiliki akses **PREMIUM**!')
        .setColor(0x00FF00)
        .addFields(
            { name: '⭐ Status', value: 'PREMIUM USER', inline: true },
            { name: '⏰ Masa Aktif', value: remaining, inline: true },
            { name: '📅 Ditambahkan', value: addedDate, inline: true },
            { name: '👤 Diberikan Oleh', value: grantedBy, inline: true },
            { name: '🔓 Akses Panel', value: 'Aktif', inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Valuamor Premium System' });
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleSetBuyerInteraction(interaction) {
    const action = interaction.customId.split('_')[1];
    
    if (action === 'newuser' || action === 'extend') {
        const modalTitle = action === 'newuser' ? 'Tambah Premium User Baru' : 'Perpanjang Premium User';
        const embed = new EmbedBuilder()
            .setTitle(`💎 ${modalTitle}`)
            .setDescription('Masukkan **User ID** Discord user yang ingin Anda tambahkan/perpanjang:\n\n*Cara mendapatkan User ID: Klik kanan user > Copy ID (Developer Mode harus aktif)*')
            .setColor(0xFFD700)
            .setTimestamp();
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`setbuyer_inputid_${action}`)
                    .setLabel('Input User ID')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('✍️'),
                new ButtonBuilder()
                    .setCustomId('setbuyer_cancel')
                    .setLabel('Batal')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('❌')
            );
        
        await interaction.update({ embeds: [embed], components: [row] });
    }
    
    else if (action === 'inputid') {
        const originalAction = interaction.customId.split('_')[2];
        
        await interaction.reply({
            content: '📝 Silakan reply pesan ini dengan **User ID** target:\n*Format: ketik User ID saja, contoh: 1234567890*',
            ephemeral: true
        });
        
        const filter = m => m.author.id === interaction.user.id;
        const collector = interaction.channel.createMessageCollector({ filter, max: 1, time: 60000 });
        
        collector.on('collect', async (msg) => {
            const targetUserId = msg.content.trim();
            
            if (!/^\d+$/.test(targetUserId)) {
                return msg.reply({ content: '❌ User ID tidak valid! Harus berupa angka saja.', ephemeral: true });
            }
            
            try {
                await msg.delete();
            } catch (e) {}
            
            const durationEmbed = new EmbedBuilder()
                .setTitle('⏰ Pilih Durasi Premium')
                .setDescription(`Target User ID: \`${targetUserId}\`\n\nPilih durasi premium yang ingin Anda berikan:`)
                .setColor(0xFFD700)
                .setTimestamp();
            
            const row1 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`setbuyer_duration_${targetUserId}_7_days`)
                        .setLabel('7 Hari')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`setbuyer_duration_${targetUserId}_30_days`)
                        .setLabel('30 Hari')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`setbuyer_duration_${targetUserId}_1_months`)
                        .setLabel('1 Bulan')
                        .setStyle(ButtonStyle.Primary)
                );
            
            const row2 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`setbuyer_duration_${targetUserId}_3_months`)
                        .setLabel('3 Bulan')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`setbuyer_duration_${targetUserId}_6_months`)
                        .setLabel('6 Bulan')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`setbuyer_duration_${targetUserId}_1_years`)
                        .setLabel('1 Tahun')
                        .setStyle(ButtonStyle.Success)
                );
            
            const row3 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`setbuyer_duration_${targetUserId}_0_lifetime`)
                        .setLabel('Lifetime')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('♾️'),
                    new ButtonBuilder()
                        .setCustomId(`setbuyer_customtime_${targetUserId}`)
                        .setLabel('Custom Waktu (detik)')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⏱️')
                );
            
            await interaction.followUp({ embeds: [durationEmbed], components: [row1, row2, row3], ephemeral: true });
        });
        
        collector.on('end', collected => {
            if (collected.size === 0) {
                interaction.followUp({ content: '❌ Waktu habis! Silakan coba lagi.', ephemeral: true });
            }
        });
    }
    
    else if (action === 'customtime') {
        const targetUserId = interaction.customId.split('_')[2];
        
        await interaction.reply({
            content: '⏱️ Reply pesan ini dengan **jumlah detik** yang ingin Anda berikan:\n*Format: ketik angka saja, contoh: 1000 (untuk 1000 detik)*',
            ephemeral: true
        });
        
        const filter = m => m.author.id === interaction.user.id;
        const collector = interaction.channel.createMessageCollector({ filter, max: 1, time: 60000 });
        
        collector.on('collect', async (msg) => {
            const seconds = parseInt(msg.content.trim());
            
            if (isNaN(seconds) || seconds <= 0) {
                return msg.reply({ content: '❌ Jumlah detik tidak valid! Harus berupa angka positif.', ephemeral: true });
            }
            
            try {
                await msg.delete();
            } catch (e) {}
            
            addPremiumTime(targetUserId, 'seconds', seconds, interaction.user.username);
            
            const durationText = `${seconds} detik`;
            
            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Premium Berhasil Ditambahkan!')
                .setDescription(`User <@${targetUserId}> telah mendapatkan akses premium!`)
                .setColor(0x00FF00)
                .addFields(
                    { name: 'User ID', value: targetUserId, inline: true },
                    { name: 'Durasi', value: durationText, inline: true },
                    { name: 'Diberikan Oleh', value: interaction.user.username, inline: true }
                )
                .setTimestamp();
            
            await interaction.followUp({ embeds: [successEmbed], ephemeral: true });
            
            try {
                const targetUser = await client.users.fetch(targetUserId);
                const notifEmbed = new EmbedBuilder()
                    .setTitle('🎉 Selamat! Anda Mendapat Akses Premium!')
                    .setDescription(`Akun Anda telah di-upgrade ke **PREMIUM** oleh **${interaction.user.username}**!`)
                    .setColor(0xFFD700)
                    .addFields(
                        { name: '⭐ Status', value: 'PREMIUM USER', inline: true },
                        { name: '⏰ Durasi', value: durationText, inline: true },
                        { name: '👤 Diberikan Oleh', value: interaction.user.username, inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Gunakan /getstatus untuk cek masa aktif Anda' });
                
                await targetUser.send({ embeds: [notifEmbed] });
            } catch (error) {
                console.log(`Could not DM user ${targetUserId}`);
            }
        });
    }
    
    else if (action === 'duration') {
        const parts = interaction.customId.split('_');
        const targetUserId = parts[2];
        const durationValue = parseInt(parts[3]);
        const durationType = parts[4];
        
        if (durationType !== 'lifetime' && (isNaN(durationValue) || durationValue <= 0)) {
            return interaction.update({ 
                content: '❌ Durasi tidak valid! Harus berupa angka positif.', 
                components: [] 
            });
        }
        
        addPremiumTime(targetUserId, durationType, durationValue, interaction.user.username);
        
        const durationText = durationType === 'lifetime' ? 'Lifetime' : 
                            `${durationValue} ${durationType === 'days' ? 'Hari' : durationType === 'months' ? 'Bulan' : 'Tahun'}`;
        
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Premium Berhasil Ditambahkan!')
            .setDescription(`User <@${targetUserId}> telah mendapatkan akses premium!`)
            .setColor(0x00FF00)
            .addFields(
                { name: 'User ID', value: targetUserId, inline: true },
                { name: 'Durasi', value: durationText, inline: true },
                { name: 'Diberikan Oleh', value: interaction.user.username, inline: true }
            )
            .setTimestamp();
        
        await interaction.update({ embeds: [successEmbed], components: [] });
        
        try {
            const targetUser = await client.users.fetch(targetUserId);
            const notifEmbed = new EmbedBuilder()
                .setTitle('🎉 Selamat! Anda Mendapat Akses Premium!')
                .setDescription(`Akun Anda telah di-upgrade ke **PREMIUM** oleh **${interaction.user.username}**!`)
                .setColor(0xFFD700)
                .addFields(
                    { name: '⭐ Status', value: 'PREMIUM USER', inline: true },
                    { name: '⏰ Durasi', value: durationText, inline: true },
                    { name: '👤 Diberikan Oleh', value: interaction.user.username, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'Gunakan /getstatus untuk cek masa aktif Anda' });
            
            await targetUser.send({ embeds: [notifEmbed] });
        } catch (error) {
            console.log(`Could not DM user ${targetUserId}`);
        }
    }
    
    else if (action === 'list') {
        const premiumUsers = Object.entries(database.premiumBuyers);
        
        if (premiumUsers.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle('📋 List Premium Users')
                .setDescription('Belum ada premium user.')
                .setColor(0xFF0000);
            
            return interaction.update({ embeds: [embed], components: [] });
        }
        
        const embed = new EmbedBuilder()
            .setTitle('📋 List Premium Users')
            .setDescription(`Total: **${premiumUsers.length}** premium users`)
            .setColor(0xFFD700)
            .setTimestamp();
        
        for (const [userId, buyer] of premiumUsers.slice(0, 10)) {
            const status = isPremiumActive(userId) ? '✅ Aktif' : '❌ Expired';
            const remaining = getRemainingTime(userId);
            embed.addFields({
                name: `User: ${userId}`,
                value: `Status: ${status}\nMasa Aktif: ${remaining}`,
                inline: true
            });
        }
        
        if (premiumUsers.length > 10) {
            embed.setFooter({ text: `Menampilkan 10 dari ${premiumUsers.length} users` });
        }
        
        await interaction.update({ embeds: [embed], components: [] });
    }
    
    else if (action === 'remove') {
        await interaction.reply({
            content: '📝 Reply pesan ini dengan **User ID** yang ingin dihapus dari premium:',
            ephemeral: true
        });
        
        const filter = m => m.author.id === interaction.user.id;
        const collector = interaction.channel.createMessageCollector({ filter, max: 1, time: 30000 });
        
        collector.on('collect', async (msg) => {
            const targetUserId = msg.content.trim();
            
            if (!database.premiumBuyers[targetUserId]) {
                return msg.reply({ content: '❌ User tersebut tidak memiliki premium!', ephemeral: true });
            }
            
            delete database.premiumBuyers[targetUserId];
            saveDatabase(database);
            
            try {
                await msg.delete();
            } catch (e) {}
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Premium Dihapus')
                .setDescription(`User <@${targetUserId}> telah dihapus dari premium.`)
                .setColor(0xFF0000)
                .setTimestamp();
            
            await interaction.followUp({ embeds: [embed], ephemeral: true });
        });
    }
    
    else if (action === 'cancel') {
        await interaction.update({ content: '❌ Dibatalkan.', embeds: [], components: [] });
    }
}

async function handleRedeemCommand(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('🎟️ Redeem Kode Premium')
        .setDescription('Masukkan kode redeem Anda untuk mendapatkan akses!')
        .setColor(0x5865F2)
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('redeem_inputcode')
                .setLabel('Input Kode')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('✍️')
        );

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

async function handlePartnerSetupSlash(interaction) {
    const guildId = interaction.guild.id;
    const partnerConfig = database.partnerConfig[guildId] || {};
    
    const currentReceiver = partnerConfig.receiverId ? `<@${partnerConfig.receiverId}>` : 'Belum diset';
    
    const embed = new EmbedBuilder()
        .setTitle('⚙️ Partner System Setup')
        .setDescription('**Setup Partner Request System**\n\nKonfigurasi sistem partner request untuk server ini.\n\nGunakan `!requestpt` untuk menampilkan panel request partner ke publik.')
        .setColor(0x5865F2)
        .addFields(
            { name: '📬 Request Receiver', value: currentReceiver, inline: true },
            { name: '📊 Total Requests', value: `${Object.keys(database.partnerRequests[guildId] || {}).length}`, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Partner Setup Panel' });

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('partnerset_receiver')
                .setLabel('Set Receiver')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('👤'),
            new ButtonBuilder()
                .setCustomId('partnerset_viewall')
                .setLabel('View All Requests')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📋')
        );

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

async function handlePartnerRequestPanel(message) {
    const guildId = message.guild.id;
    const partnerConfig = database.partnerConfig[guildId] || {};
    
    const embed = new EmbedBuilder()
        .setTitle('🤝 Partner Request')
        .setDescription('**Request Partner | Ajukan Partnership**\n\nKlik tombol di bawah untuk mengajukan partnership dengan server kami!\n\nClick the button below to request a partnership with our server!')
        .setColor(0x5865F2)
        .setImage('https://cdn.discordapp.com/attachments/1441807323512438795/1442899446160425064/Videoshot_20251125_232653.jpg?ex=69271c53&is=6925cad3&hm=32acf34fb998e82ed8add5ac6a31dd2c933618fe3772bea1ed2be9907676919c&')
        .setTimestamp()
        .setFooter({ text: 'Partner Request System' });

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('partner_request')
                .setLabel('Request Partner')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📝'),
            new ButtonBuilder()
                .setCustomId('partner_viewrequests')
                .setLabel('View Requests')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📋')
        );

    await message.channel.send({ embeds: [embed], components: [row] });
    try {
        await message.delete();
    } catch (e) {}
}

async function handlePartnerSetupPanel(message) {
    const guildId = message.guild.id;
    const partnerConfig = database.partnerConfig[guildId] || {};
    
    const currentReceiver = partnerConfig.receiverId ? `<@${partnerConfig.receiverId}>` : 'Belum diset';
    
    const embed = new EmbedBuilder()
        .setTitle('⚙️ Partner System Setup')
        .setDescription('**Setup Partner Request System**\n\nKonfigurasi sistem partner request untuk server ini.')
        .setColor(0x5865F2)
        .addFields(
            { name: '📬 Request Receiver', value: currentReceiver, inline: true },
            { name: '📊 Total Requests', value: `${Object.keys(database.partnerRequests[guildId] || {}).length}`, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Partner Setup Panel' });

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('partnerset_receiver')
                .setLabel('Set Receiver')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('👤'),
            new ButtonBuilder()
                .setCustomId('partnerset_viewall')
                .setLabel('View All Requests')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📋')
        );

    await message.reply({ embeds: [embed], components: [row] });
}

async function handlePartnerRequestInteraction(interaction) {
    const action = interaction.customId.split('_')[1];
    const guildId = interaction.guild?.id;
    
    if (action === 'request') {
        const member = interaction.member;
        
        const existingRole = member.roles.cache.find(role => role.name.toLowerCase() === 'partner');
        if (existingRole) {
            return interaction.reply({ 
                content: '❌ Anda sudah memiliki role Partner! / You already have the Partner role!', 
                ephemeral: true 
            });
        }
        
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
        const modal = new ModalBuilder()
            .setCustomId('partner_modalrequest')
            .setTitle('Partner Request Form');

        const nameInput = new TextInputBuilder()
            .setCustomId('servername')
            .setLabel('Nama Server Discord Anda / Your Server Name')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Contoh: My Awesome Server')
            .setRequired(true)
            .setMaxLength(100);

        const reasonInput = new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('Alasan Ingin Partner / Reason for Partnership')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Jelaskan mengapa Anda ingin menjadi partner...')
            .setRequired(true)
            .setMaxLength(500);

        const linkInput = new TextInputBuilder()
            .setCustomId('discordlink')
            .setLabel('Link Discord Server Anda / Your Server Link')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('https://discord.gg/xxxxx')
            .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(nameInput);
        const row2 = new ActionRowBuilder().addComponents(reasonInput);
        const row3 = new ActionRowBuilder().addComponents(linkInput);
        modal.addComponents(row1, row2, row3);
        
        await interaction.showModal(modal);
    }
    
    else if (action === 'modalrequest') {
        const serverName = interaction.fields.getTextInputValue('servername');
        const reason = interaction.fields.getTextInputValue('reason');
        const discordLink = interaction.fields.getTextInputValue('discordlink');
        
        const partnerConfig = database.partnerConfig[guildId] || {};
        const receiverId = partnerConfig.receiverId;
        
        if (!receiverId) {
            return interaction.reply({ 
                content: '❌ Partner system belum dikonfigurasi! Hubungi admin.', 
                ephemeral: true 
            });
        }
        
        const requestId = `PR-${Date.now()}-${interaction.user.id.slice(-4)}`;
        
        if (!database.partnerRequests[guildId]) {
            database.partnerRequests[guildId] = {};
        }
        
        database.partnerRequests[guildId][requestId] = {
            userId: interaction.user.id,
            username: interaction.user.username,
            serverName: serverName,
            reason: reason,
            discordLink: discordLink,
            status: 'pending',
            createdAt: Date.now(),
            guildId: guildId
        };
        saveDatabase(database);
        
        try {
            const receiver = await client.users.fetch(receiverId);
            
            const dmEmbed = new EmbedBuilder()
                .setTitle('📬 New Partner Request!')
                .setDescription(`**Request ID:** \`${requestId}\``)
                .setColor(0x5865F2)
                .addFields(
                    { name: '👤 Requester', value: `<@${interaction.user.id}> (${interaction.user.username})`, inline: true },
                    { name: '🏷️ Server Name', value: serverName, inline: true },
                    { name: '📝 Reason', value: reason, inline: false },
                    { name: '🔗 Discord Link', value: discordLink, inline: false }
                )
                .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                .setTimestamp()
                .setFooter({ text: `From: ${interaction.guild.name}` });

            const dmRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`partnerreview_accept_${requestId}_${guildId}`)
                        .setLabel('Accept')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('✅'),
                    new ButtonBuilder()
                        .setCustomId(`partnerreview_reject_${requestId}_${guildId}`)
                        .setLabel('Reject')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('❌')
                );

            await receiver.send({ embeds: [dmEmbed], components: [dmRow] });
        } catch (error) {
            console.error('Error sending DM to receiver:', error);
        }
        
        const confirmEmbed = new EmbedBuilder()
            .setTitle('🤝 Partner Request Submitted!')
            .setDescription('**Thank you for your request! | Terimakasih telah request!**\n\nYour partnership request has been submitted and is pending review.\n\nPermintaan partnership Anda telah diajukan dan sedang menunggu review.')
            .setColor(0x57F287)
            .setImage('https://cdn.discordapp.com/attachments/1441807323512438795/1442899445829206246/Videoshot_20251125_232658.jpg?ex=69271c53&is=6925cad3&hm=74c6bca7df81d24d62ad2c3daf4089e567d1f6785c9075ec41f7a78b702f5850&')
            .addFields(
                { name: '📋 Request ID', value: `\`${requestId}\``, inline: true },
                { name: '📊 Status', value: '⏳ Pending', inline: true }
            )
            .setTimestamp();

        const publicMsg = await interaction.reply({ embeds: [confirmEmbed], fetchReply: true });
        
        try {
            const dmConfirmEmbed = new EmbedBuilder()
                .setTitle('📬 Partner Request Received!')
                .setDescription('**Thank you for your request! | Terimakasih telah request!**\n\nWe have received your partnership request. Please wait for the admin to review it.')
                .setColor(0x57F287)
                .addFields(
                    { name: '🏷️ Server Name', value: serverName, inline: true },
                    { name: '📋 Request ID', value: `\`${requestId}\``, inline: true }
                )
                .setTimestamp();
            
            await interaction.user.send({ embeds: [dmConfirmEmbed] });
        } catch (e) {
            console.log('Could not DM user confirmation');
        }
        
        setTimeout(async () => {
            try {
                await publicMsg.delete();
            } catch (e) {}
        }, 4000);
    }
    
    else if (action === 'viewrequests') {
        const requests = database.partnerRequests[guildId] || {};
        const userRequests = Object.entries(requests).filter(([id, data]) => data.userId === interaction.user.id);
        
        if (userRequests.length === 0) {
            return interaction.reply({ 
                content: '📋 Anda belum memiliki request partner. / You have no partner requests yet.', 
                ephemeral: true 
            });
        }
        
        const embed = new EmbedBuilder()
            .setTitle('📋 Your Partner Requests')
            .setColor(0x5865F2)
            .setTimestamp();
        
        let description = '';
        userRequests.slice(0, 10).forEach(([id, data]) => {
            const statusEmoji = data.status === 'accepted' ? '✅' : data.status === 'rejected' ? '❌' : '⏳';
            description += `\n**${id}**\nServer: ${data.serverName}\nStatus: ${statusEmoji} ${data.status}\n`;
        });
        
        embed.setDescription(description);
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

async function handlePartnerReviewInteraction(interaction) {
    const parts = interaction.customId.split('_');
    const action = parts[1];
    const requestId = parts[2];
    const guildId = parts[3];
    
    const request = database.partnerRequests[guildId]?.[requestId];
    
    if (!request) {
        return interaction.reply({ content: '❌ Request not found!', ephemeral: true });
    }
    
    if (request.status !== 'pending') {
        return interaction.reply({ content: '❌ This request has already been processed!', ephemeral: true });
    }
    
    let guild = null;
    try {
        guild = await client.guilds.fetch(guildId);
    } catch (e) {
        return interaction.reply({ content: '❌ Could not find the server! Bot might not be in the server anymore.', ephemeral: true });
    }
    
    if (!guild) {
        return interaction.reply({ content: '❌ Could not find the server!', ephemeral: true });
    }
    
    const botMember = guild.members.cache.get(client.user.id);
    if (!botMember) {
        return interaction.reply({ content: '❌ Bot is not in the server!', ephemeral: true });
    }
    
    if (action === 'accept') {
        try {
            if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
                return interaction.reply({ 
                    content: '❌ Bot tidak punya permission **Manage Roles**! Pastikan bot memiliki permission ini di server.', 
                    ephemeral: true 
                });
            }
            
            if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
                return interaction.reply({ 
                    content: '❌ Bot tidak punya permission **Manage Channels**! Pastikan bot memiliki permission ini di server.', 
                    ephemeral: true 
                });
            }
            
            let partnerRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'partner');
            if (!partnerRole) {
                partnerRole = await guild.roles.create({
                    name: 'Partner',
                    color: 0x5865F2,
                    hoist: false,
                    mentionable: true,
                    reason: 'Auto-created by Partner System'
                });
                console.log('✅ Created Partner role');
            }
            
            let member = null;
            try {
                member = await guild.members.fetch(request.userId);
            } catch (e) {
                console.log('Could not fetch member, they might have left the server');
            }
            
            if (member) {
                const hasRole = member.roles.cache.has(partnerRole.id);
                if (!hasRole) {
                    await member.roles.add(partnerRole);
                    console.log('✅ Added Partner role to member');
                }
            }
            
            let partnerCategory = guild.channels.cache.find(c => c.name === '☃️ Partner' && c.type === ChannelType.GuildCategory);
            if (!partnerCategory) {
                partnerCategory = await guild.channels.create({
                    name: '☃️ Partner',
                    type: ChannelType.GuildCategory,
                    reason: 'Auto-created by Partner System'
                });
                console.log('✅ Created Partner category');
            }
            
            const cleanServerName = request.serverName
                .replace(/[^a-zA-Z0-9\s-]/g, '')
                .trim()
                .substring(0, 50);
            const channelName = `☄️-${cleanServerName}`.toLowerCase().replace(/\s+/g, '-');
            
            const partnerChannel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: partnerCategory.id,
                reason: `Partner channel for ${request.serverName}`
            });
            console.log('✅ Created Partner channel:', channelName);
            
            const welcomeEmbed = new EmbedBuilder()
                .setTitle('🎉 Welcome Partner!')
                .setDescription(`**${request.serverName}** is now our partner!\n\n**Discord:** ${request.discordLink}`)
                .setColor(0x57F287)
                .addFields(
                    { name: '👤 Representative', value: `<@${request.userId}>`, inline: true }
                )
                .setTimestamp();
            
            await partnerChannel.send({ embeds: [welcomeEmbed] });
            
            request.status = 'accepted';
            request.reviewedAt = Date.now();
            request.reviewedBy = interaction.user.id;
            request.channelId = partnerChannel.id;
            request.roleId = partnerRole.id;
            saveDatabase(database);
            
            try {
                const userNotif = await client.users.fetch(request.userId);
                const acceptEmbed = new EmbedBuilder()
                    .setTitle('🎉 Partner Request Accepted!')
                    .setDescription('**Congratulations! | Selamat!**\n\nYour partnership request has been **ACCEPTED**!\n\nPermintaan partnership Anda telah **DITERIMA**!')
                    .setColor(0x57F287)
                    .addFields(
                        { name: '🏷️ Server', value: request.serverName, inline: true },
                        { name: '🎭 Role', value: 'Partner', inline: true },
                        { name: '📢 Channel', value: `<#${partnerChannel.id}>`, inline: true }
                    )
                    .setTimestamp();
                
                await userNotif.send({ embeds: [acceptEmbed] });
            } catch (e) {
                console.log('Could not DM user about acceptance');
            }
            
            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Partner Request Accepted!')
                .setDescription(`Request **${requestId}** has been accepted.\n\n✅ Partner role assigned\n✅ Category "☃️ Partner" ready\n✅ Channel "${channelName}" created`)
                .setColor(0x57F287)
                .addFields(
                    { name: '👤 User', value: `<@${request.userId}>`, inline: true },
                    { name: '📢 Channel', value: `<#${partnerChannel.id}>`, inline: true }
                )
                .setTimestamp();
            
            await interaction.update({ embeds: [successEmbed], components: [] });
            
        } catch (error) {
            console.error('Error processing partner acceptance:', error);
            
            let errorMsg = '❌ Terjadi kesalahan saat memproses request.';
            if (error.code === 50013) {
                errorMsg = '❌ **Missing Permissions!**\n\nBot tidak memiliki permission yang cukup. Pastikan:\n1. Bot memiliki permission **Manage Roles**\n2. Bot memiliki permission **Manage Channels**\n3. Role bot berada di atas role "Partner" di daftar role server';
            } else if (error.message) {
                errorMsg = `❌ Error: ${error.message}`;
            }
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMsg, ephemeral: true });
            } else {
                await interaction.reply({ content: errorMsg, ephemeral: true });
            }
        }
    }
    
    else if (action === 'reject') {
        request.status = 'rejected';
        request.reviewedAt = Date.now();
        request.reviewedBy = interaction.user.id;
        saveDatabase(database);
        
        try {
            const userNotif = await client.users.fetch(request.userId);
            const rejectEmbed = new EmbedBuilder()
                .setTitle('❌ Partner Request Rejected')
                .setDescription('**Sorry! | Maaf!**\n\nYour partnership request has been rejected.\n\nPermintaan partnership Anda telah ditolak.')
                .setColor(0xFF0000)
                .addFields(
                    { name: '🏷️ Server', value: request.serverName, inline: true }
                )
                .setTimestamp();
            
            await userNotif.send({ embeds: [rejectEmbed] });
        } catch (e) {
            console.log('Could not notify user of rejection');
        }
        
        const rejectConfirm = new EmbedBuilder()
            .setTitle('❌ Partner Request Rejected')
            .setDescription(`Request **${requestId}** has been rejected.\nUser has been notified.`)
            .setColor(0xFF0000)
            .setTimestamp();
        
        await interaction.update({ embeds: [rejectConfirm], components: [] });
    }
}

async function handlePartnerSetInteraction(interaction) {
    const action = interaction.customId.split('_')[1];
    const guildId = interaction.guild.id;
    
    if (action === 'receiver') {
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
        const modal = new ModalBuilder()
            .setCustomId('partnerset_modalreceiver')
            .setTitle('Set Partner Request Receiver');

        const userInput = new TextInputBuilder()
            .setCustomId('userid')
            .setLabel('User ID (akan menerima DM request)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Masukkan User ID Discord...')
            .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(userInput);
        modal.addComponents(row1);
        await interaction.showModal(modal);
    }
    
    else if (action === 'modalreceiver') {
        const userId = interaction.fields.getTextInputValue('userid');
        
        if (!database.partnerConfig[guildId]) {
            database.partnerConfig[guildId] = {};
        }
        
        database.partnerConfig[guildId].receiverId = userId;
        saveDatabase(database);
        
        const embed = new EmbedBuilder()
            .setTitle('✅ Receiver Updated!')
            .setDescription(`Partner request akan dikirim ke <@${userId}>`)
            .setColor(0x57F287)
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    else if (action === 'viewall') {
        const requests = database.partnerRequests[guildId] || {};
        const allRequests = Object.entries(requests);
        
        if (allRequests.length === 0) {
            return interaction.reply({ 
                content: '📋 Belum ada partner request.', 
                ephemeral: true 
            });
        }
        
        const embed = new EmbedBuilder()
            .setTitle('📋 All Partner Requests')
            .setColor(0x5865F2)
            .setTimestamp();
        
        let description = '';
        allRequests.slice(0, 15).forEach(([id, data]) => {
            const statusEmoji = data.status === 'accepted' ? '✅' : data.status === 'rejected' ? '❌' : '⏳';
            description += `\n**${id}**\n<@${data.userId}> | ${data.serverName}\nStatus: ${statusEmoji} ${data.status}\n`;
        });
        
        embed.setDescription(description);
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

client.login(DISCORD_BOT_TOKEN);
