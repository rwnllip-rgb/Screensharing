const { Client } = require("discord.js-selfbot-v13");
const { Streamer, prepareStream, playStream, Utils, Encoders } = require("@dank074/discord-video-stream");
const TorrentSearchApi = require('torrent-search-api');
const express = require('express');

const client = new Client();
const streamer = new Streamer(client);

// ================= حل مشكلة استدعاء WebTorrent =================
let torrentClient;
import('webtorrent').then(mod => {
    const WebTorrent = mod.default || mod;
    torrentClient = new WebTorrent();
    console.log("✅ مكتبة WebTorrent جاهزة!");
}).catch(err => console.error("❌ خطأ في تحميل WebTorrent:", err));
// ==============================================================

// ================= الإعدادات =================
TorrentSearchApi.enableProvider('1337x');
TorrentSearchApi.enableProvider('ThePirateBay');

// إذا بتشغله بجهازك حط التوكن بين علامات التنصيص الفاضية، وإذا بريندر بيسحبه تلقائي
const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = "1143587192061558988";
const VOICE_CHANNEL_ID = "1143587192984317964";
const PREFIX = "$"; 
// =============================================

// دالة البحث عن الماجنت
async function searchMovieMagnet(query) {
    try {
        console.log(`⏳ جاري البحث في مواقع التورنت عن: ${query}`);
        const torrents = await TorrentSearchApi.search(query, 'Video', 1);
        
        if (!torrents || torrents.length === 0) return null;

        const bestTorrent = torrents[0];
        console.log(`✅ تم العثور على الفلم: ${bestTorrent.title}`);

        const magnet = await TorrentSearchApi.getMagnet(bestTorrent);
        return magnet || null;
    } catch (err) {
        console.error("❌ خطأ في البحث عن الفلم:", err.message);
        return null;
    }
}

client.on("ready", () => {
    console.log(`✅ البوت شغال باسم: ${client.user.tag} (وضع WebTorrent المجاني)`);
});

client.on("messageCreate", async (message) => {
    if (!message.content.startsWith(PREFIX) || message.author.bot) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === "play") {
        const movieQuery = args.join(" ");
        if (!movieQuery) return message.reply("❌ اكتب اسم الفلم!");

        if (!torrentClient) return message.reply("⏳ جاري تهيئة نظام التحميل، حاول مرة أخرى بعد ثوانٍ.");

        const msg = await message.reply(`🔍 جاري البحث عن **${movieQuery}**...`);

        const magnet = await searchMovieMagnet(movieQuery);
        if (!magnet) return msg.edit("❌ ما قدرت ألقى الفلم.");

        await msg.edit(`⚙️ تم العثور على الفلم! جاري التحميل والبث عبر WebTorrent (مجاني)...`);

        torrentClient.add(magnet, { path: '/tmp/webtorrent' }, async (torrent) => {
            
            const file = torrent.files.reduce((prev, current) => (prev.length > current.length) ? prev : current);
            console.log(`🎬 تم تحديد الملف: ${file.name}`);
            
            const stream = file.createReadStream();

            try {
                await streamer.joinVoice(GUILD_ID, VOICE_CHANNEL_ID);

                let encoder = Encoders.software({
                    x264: { preset: "ultrafast" } 
                });

                const { command: ffmpegCmd, output } = prepareStream(stream, {
                    encoder,
                    height: 480, 
                    frameRate: 30,
                    bitrateVideo: 1500, 
                    videoCodec: Utils.normalizeVideoCodec("H264"),
                });

                ffmpegCmd.on("error", (err) => {
                    if (!err.message.includes('pipe:0')) console.error("FFmpeg Error:", err.message);
                });

                await playStream(output, streamer, { type: "go-live" });
                message.channel.send("✅ انتهى عرض الفلم.");
                
                torrent.destroy();
            } catch (error) {
                console.error(error);
                message.channel.send("❌ انقطع البث أو حدث خطأ.");
                torrent.destroy();
            }
        });

        torrentClient.on('error', (err) => {
            console.error("WebTorrent Error:", err.message);
        });
    }
});

client.login(TOKEN);

// ================= سيرفر Express لريندر =================
const app = express();
app.get("/", (req, res) => {
    res.send("Bot is running with Free WebTorrent!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🌐 Web server is listening on port ${PORT}`);
});

