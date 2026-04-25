const { Client } = require("discord.js-selfbot-v13");
const { Streamer, prepareStream, playStream, Utils, Encoders } = require("@dank074/discord-video-stream");
const TorrentSearchApi = require('torrent-search-api');
const axios = require('axios'); // تأكد من وجود axios
const express = require('express');

const client = new Client();
const streamer = new Streamer(client);

// ================= نظام تحميل WebTorrent =================
let torrentClient;
import('webtorrent').then(mod => {
    const WebTorrent = mod.default || mod;
    torrentClient = new WebTorrent();
    console.log("✅ نظام WebTorrent جاهز للعمل.");
}).catch(err => console.error("❌ خطأ في تحميل WebTorrent:", err));

// ================= إعدادات البحث والاتصال =================
try {
    TorrentSearchApi.enableProvider('1337x');
    TorrentSearchApi.enableProvider('ThePirateBay');
} catch (e) { console.log("⚠️ فشل تفعيل بعض مزودي البحث الاحتياطيين."); }

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = "1143587192061558988";
const VOICE_CHANNEL_ID = "1143587192984317964";
const PREFIX = "$";

// ================= دالة البحث الاحترافية (Anti-Block) =================
async function searchMovieMagnet(query) {
    console.log(`⏳ جاري البحث الذكي عن: ${query}`);

    // [1] المحاولة الأولى: استخدام YTS API (الأكثر استقراراً على السيرفرات)
    try {
        const ytsUrl = `https://yts.mx/api/v2/list_movies.json?query_term=${encodeURIComponent(query)}&quality=1080p`;
        const res = await axios.get(ytsUrl, { timeout: 5000 });
        
        if (res.data && res.data.data && res.data.data.movies) {
            const movie = res.data.data.movies[0];
            const torrent = movie.torrents.find(t => t.quality === '1080p') || movie.torrents[0];
            console.log(`✅ تم العثور عبر YTS API: ${movie.title}`);
            return `magnet:?xt=urn:btih:${torrent.hash}&dn=${encodeURIComponent(movie.title)}`;
        }
    } catch (e) {
        console.log("⚠️ فشل الاتصال بـ YTS API، جاري تجربة البحث البديل...");
    }

    // [2] المحاولة الثانية: البحث في 1337x و PirateBay (كاحتياط)
    try {
        const torrents = await TorrentSearchApi.search(query, 'Video', 3);
        if (torrents && torrents.length > 0) {
            const best = torrents.sort((a, b) => (b.seeds || 0) - (a.seeds || 0))[0];
            console.log(`✅ تم العثور عبر البحث العام: ${best.title}`);
            return await TorrentSearchApi.getMagnet(best);
        }
    } catch (e) {
        console.log("⚠️ فشل البحث العام (قد يكون بسبب حجب IP السيرفر).");
    }

    return null; // إذا لم يجد شيئاً في كل المحاولات
}

client.on("ready", () => {
    console.log(`✅ متصل ديسكورد باسم: ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
    if (!message.content.startsWith(PREFIX) || message.author.bot) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === "play") {
        const movieQuery = args.join(" ");
        if (!movieQuery) return message.reply("❌ وين اسم الفلم؟");

        if (!torrentClient) return message.reply("⏳ النظام يشتغل، عطني ثانية.");

        const msg = await message.reply(`🔍 جاري البحث عن **${movieQuery}**...`);

        const magnet = await searchMovieMagnet(movieQuery);
        if (!magnet) return msg.edit("❌ ما لقيت الفلم في أي مصدر، تأكد من الاسم بالانجلش أو جرب فلم ثاني.");

        await msg.edit(`⚙️ لقيت الفلم! جاري التحميل والبث (480p) لضمان الاستقرار...`);

        torrentClient.add(magnet, { path: '/tmp/webtorrent' }, async (torrent) => {
            const file = torrent.files.reduce((p, c) => (p.length > c.length) ? p : c);
            console.log(`🎬 جاري بث: ${file.name}`);
            
            const stream = file.createReadStream();

            try {
                await streamer.joinVoice(GUILD_ID, VOICE_CHANNEL_ID);

                const { command: ffmpegCmd, output } = prepareStream(stream, {
                    encoder: Encoders.software({ x264: { preset: "ultrafast" } }),
                    height: 480, 
                    frameRate: 30,
                    bitrateVideo: 1500, 
                    videoCodec: Utils.normalizeVideoCodec("H264"),
                });

                ffmpegCmd.on("error", (err) => {
                    if (!err.message.includes('pipe:0')) console.error("FFmpeg Error:", err.message);
                });

                await playStream(output, streamer, { type: "go-live" });
                message.channel.send("✅ انتهى الفلم، ان شاء الله استمتعتوا!");
                torrent.destroy();
            } catch (error) {
                console.error(error);
                message.channel.send("❌ حدث خطأ أثناء البث، غالباً بسبب ضعف الـ Seeds.");
                torrent.destroy();
            }
        });
    }
});

client.login(TOKEN);

// ================= سيرفر الريندر =================
const app = express();
app.get("/", (req, res) => res.send("Movie Bot is Live 24/7!"));
app.listen(process.env.PORT || 3000);
