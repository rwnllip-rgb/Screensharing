# نستخدم بيئة نود مبنية على نظام دبيان
FROM node:18-bullseye

# هذا السطر السحري اللي يثبت FFmpeg النسخة الكاملة
RUN apt-get update && apt-get install -y ffmpeg

# تحديد مجلد العمل داخل السيرفر
WORKDIR /app

# نسخ ملفات المكاتب وتثبيتها
COPY package*.json ./
RUN npm install

# نسخ باقي كود البوت
COPY . .

# فتح البورت عشان سيرفر الويب يشتغل (عشان UptimeRobot)
EXPOSE 3000

# أمر تشغيل البوت
CMD ["node", "index.js"]