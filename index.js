const { Client } = require("discord.js-selfbot-v13");
const { Streamer, prepareStream, playStream, Utils, Encoders } = require("@dank074/discord-video-stream");
const TorrentSearchApi = require('torrent-search-api');
const axios = require('axios');
const express = require('express');

const client = new Client();
const streamer = new Streamer(client);

// ================= نظام تحميل WebTorrent =================
let torrentClient;
import('webtorrent').then(mod => {
    const WebTorrent = mod.default || mod;
    torrentClient = new WebTorrent();
    console.log("✅ نظام WebTorrent جاهز.");
}).catch(err => console.error("❌ خطأ WebTorrent:", err));

// ================= إعدادات البحث =================
try {
    TorrentSearchApi.enableProvider('1337x');
    TorrentSearchApi.enableProvider('ThePirateBay');
} catch (e) { console.log("⚠️ فشل تفعيل بعض المزودين."); }

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = "1143587192061558988";
const VOICE_CHANNEL_ID = "1143587192984317964";
const PREFIX = "$";

// دالة البحث مع (تزييف هوية المتصفح) لتجنب الحجب
async function searchMovieMagnet(query) {
    console.log(`⏳ محاولة البحث عن: ${query}`);

    const searchUrls = [
        `https://yts.mx/api/v2/list_movies.json?query_term=${encodeURIComponent(query)}`,
        `https://yts.pm/api/v2/list_movies.json?query_term=${encodeURIComponent(query)}`, // رابط بديل
        `https://yts.do/api/v2/list_movies.json?query_term=${encodeURIComponent(query)}`   // رابط بديل 2
    ];

    for (let url of searchUrls) {
        try {
            const res = await axios.get(url, { 
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            
            if (res.data?.data?.movies) {
                const movie = res.data.data.movies[0];
                const torrent = movie.torrents.find(t => t.quality === '1080p') || movie.torrents[0];
                console.log(`✅ تم العثور عبر: ${url}`);
                return `magnet:?xt=urn:btih:${torrent.hash}&dn=${encodeURIComponent(movie.title)}`;
            }
        } catch (e) {
            console.log(`⚠️ الرابط ${url} محجوب أو طافي.`);
        }
    }

    // إذا فشل YTS، نجرب البحث العام كآخر أمل
    try {
        const torrents = await TorrentSearchApi.search(query, 'Video', 3);
        if (torrents?.length > 0) {
            const best = torrents.sort((a, b) => (b.seeds || 0) - (a.seeds || 0))[0];
            return await TorrentSearchApi.getMagnet(best);
        }
    } catch (e) { console.log("❌ جميع مصادر البحث محجوبة عن سيرفر ريندر."); }

    return null;
}

client.on("ready", () => console.log(`✅ متصل: ${client.user.tag}`));

client.on("messageCreate", async (message) => {
    if (!message.content.startsWith(PREFIX) || message.author.bot) return;
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === "play") {
        const query = args.join(" ");
        if (!query) return message.reply("❌ اكتب اسم الفلم!");
        const msg = await message.reply(`🔍 جاري المحاولة مع عدة مصادر...`);

        const magnet = await searchMovieMagnet(query);
        if (!magnet) return msg.edit("❌ للأسف، جميع مواقع الأفلام حاجبه سيرفر ريندر. الحل هو استخدام VPS.");

        await msg.edit(`⚙️ تم استخراج الماجنت! جاري التحميل والبث...`);

        torrentClient.add(magnet, { path: '/tmp/webtorrent' }, async (torrent) => {
            const file = torrent.files.reduce((p, c) => (p.length > c.length) ? p : c);
            const stream = file.createReadStream();
            try {
                await streamer.joinVoice(GUILD_ID, VOICE_CHANNEL_ID);
                const { command: ffmpegCmd, output } = prepareStream(stream, {
                    encoder: Encoders.software({ x264: { preset: "ultrafast" } }),
                    height: 480, bitrateVideo: 1500,
                    videoCodec: Utils.normalizeVideoCodec("H264"),
                });
                await playStream(output, streamer, { type: "go-live" });
            } catch (e) { console.error(e); torrent.destroy(); }
        });
    }
});

client.login(TOKEN);
const app = express();
app.get("/", (req, res) => res.send("Bot is Active"));
app.listen(process.env.PORT || 3000);
