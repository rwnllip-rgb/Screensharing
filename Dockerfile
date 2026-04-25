# تم تحديث النسخة إلى 22 لحل مشكلة "ReferenceError: File is not defined"
FROM node:22-bullseye

# تثبيت FFmpeg النسخة الكاملة
RUN apt-get update && apt-get install -y ffmpeg

# تحديد مجلد العمل
WORKDIR /app

# نسخ ملفات المكاتب وتثبيتها
COPY package*.json ./
RUN npm install

# نسخ باقي كود البوت
COPY . .

# فتح البورت لريندر و UptimeRobot
EXPOSE 3000

# أمر تشغيل البوت
CMD ["node", "index.js"]
