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

// ================= الإعدادات المتقدمة للبحث =================
// تفعيل عدة مصادر لضمان تخطي حجب الـ IP في ريندر
try {
    TorrentSearchApi.enableProvider('1337x');
    TorrentSearchApi.enableProvider('ThePirateBay');
    TorrentSearchApi.enableProvider('Limetorrents');
    TorrentSearchApi.enableProvider('TorrentProject');
    console.log("✅ تم تفعيل كافة مزودي البحث بنجاح.");
} catch (e) {
    console.error("⚠️ فشل تفعيل بعض مزودي البحث، سيتم العمل بالمتاح.");
}

const TOKEN = process.env.DISCORD_TOKEN; // يفضل تركه يسحب من Environment Variables في ريندر
const GUILD_ID = "1143587192061558988";
const VOICE_CHANNEL_ID = "1143587192984317964";
const PREFIX = "$"; 
// ==============================================================

// دالة البحث المطورة (مضمونة أكثر)
async function searchMovieMagnet(query) {
    try {
        console.log(`⏳ جاري البحث العميق عن: ${query}`);
        
        // البحث في كل المواقع المفعلة وجلب أفضل 5 نتائج
        let torrents = await TorrentSearchApi.search(query, 'Video', 5);
        
        // محاولة ثانية بدون تحديد تصنيف لو لم تظهر نتائج
        if (!torrents || torrents.length === 0) {
            torrents = await TorrentSearchApi.search(query, 'All', 5);
        }

        if (!torrents || torrents.length === 0) return null;

        // ترتيب النتائج حسب عدد الـ Seeders لضمان جودة البث
        const sortedTorrents = torrents.sort((a, b) => (b.seeds || 0) - (a.seeds || 0));
        const bestTorrent = sortedTorrents[0];

        console.log(`✅ تم اختيار: ${bestTorrent.title} (الـ Seeds: ${bestTorrent.seeds || 'غير معروف'})`);

        const magnet = await TorrentSearchApi.getMagnet(bestTorrent);
        return magnet || null;
    } catch (err) {
        console.error("❌ خطأ أثناء عملية البحث:", err.message);
        return null;
    }
}

client.on("ready", () => {
    console.log(`✅ البوت متصل الآن باسم: ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
    if (!message.content.startsWith(PREFIX) || message.author.bot) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === "play") {
        const movieQuery = args.join(" ");
        if (!movieQuery) return message.reply("❌ يرجى كتابة اسم الفلم بعد الأمر!");

        if (!torrentClient) return message.reply("⏳ نظام التحميل قيد التشغيل، انتظر ثوانٍ وجرب مجدداً.");

        const msg = await message.reply(`🔍 جاري البحث عن **${movieQuery}** عبر عدة مصادر...`);

        const magnet = await searchMovieMagnet(movieQuery);
        if (!magnet) return msg.edit("❌ لم أتمكن من العثور على الفلم، حاول كتابة الاسم بالإنجليزية بدقة.");

        await msg.edit(`⚙️ تم العثور على أفضل تورنت! جاري الربط والبث...`);

        // إضافة التورنت والبدء بالبث
        torrentClient.add(magnet, { path: '/tmp/webtorrent' }, async (torrent) => {
            
            // اختيار ملف الفيديو الأساسي (الأكبر حجماً)
            const file = torrent.files.reduce((prev, current) => (prev.length > current.length) ? prev : current);
            console.log(`🎬 جاري بث ملف: ${file.name}`);
            
            const stream = file.createReadStream();

            try {
                await streamer.joinVoice(GUILD_ID, VOICE_CHANNEL_ID);

                // إعدادات الـ Encoder متوافقة مع موارد ريندر المحدودة
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
                message.channel.send("✅ انتهى عرض الفلم بنجاح.");
                
                torrent.destroy();
            } catch (error) {
                console.error("❌ خطأ أثناء البث:", error);
                message.channel.send("❌ انقطع البث، قد يكون السبب ضعف الـ Seeds أو موارد السيرفر.");
                torrent.destroy();
            }
        });

        torrentClient.on('error', (err) => {
            console.error("WebTorrent Error:", err.message);
        });
    }
});

client.login(TOKEN);

// ================= سيرفر Express (لضمان عمل UptimeRobot) =================
const app = express();
app.get("/", (req, res) => {
    res.send("<h1>Bot is Online!</h1><p>WebTorrent Movie Streamer is running 24/7 on Render.</p>");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🌐 Web server active on port ${PORT}`);
});
