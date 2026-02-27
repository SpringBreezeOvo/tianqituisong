// 引入 dotenv 并配置
require('dotenv').config();

const WEATHER_API_KEY = process.env.WEATHER_API_KEY;
const SERVER_CHAN_SENDKEY = process.env.SERVER_CHAN_SENDKEY;
// 你提供的 DeepSeek Key
const DEEPSEEK_API_KEY = 'sk-3dd35234a2754b7ea696680a92937ce7';

// 你需要推送的城市列表
const CITIES = [
    { name: '济南', id: '101120101' },
    { name: '济宁', id: '101120701' }
];

async function getWeatherAndPushWithAI() {
    try {
        let weatherInfoRaw = '';
        let hasRain = false;

        console.log('正在获取和风天气的基础数据...');
        // 1. 获取原生的天气数据
        for (const city of CITIES) {
            const weatherUrl = `https://devapi.qweather.com/v7/weather/3d?location=${city.id}&key=${WEATHER_API_KEY}`;
            const weatherRes = await fetch(weatherUrl);
            const weatherData = await weatherRes.json();

            if (weatherData.code !== '200') {
                console.error(`天气接口报错 (${city.name}): ${weatherData.code}`);
                continue;
            }

            const today = weatherData.daily[0];
            weatherInfoRaw += `【${city.name}】白天${today.textDay}，夜间${today.textNight}，温度最低${today.tempMin}℃ 到 最高${today.tempMax}℃，湿度${today.humidity}%。\n`;

            // 获取24小时预报查雨
            try {
                const hourlyUrl = `https://devapi.qweather.com/v7/weather/24h?location=${city.id}&key=${WEATHER_API_KEY}`;
                const hourlyRes = await fetch(hourlyUrl);
                const hourlyData = await hourlyRes.json();

                if (hourlyData.code === '200') {
                    const rainHours = hourlyData.hourly.filter(h => h.text.includes('雨') || h.text.includes('雪') || parseFloat(h.precip) > 0);
                    if (rainHours.length > 0) {
                        hasRain = true;
                        const times = rainHours.map(h => {
                            const match = h.fxTime.match(/T(\d{2}:\d{2})/);
                            return match ? match[1] : '';
                        }).filter(Boolean);

                        weatherInfoRaw += `特别注意：${city.name}在以下时间段会有降水：${times.join(', ')}。\n`;
                    }
                }
            } catch (err) {
                console.error(`获取逐小时天气出错 (${city.name}):`, err);
            }
        }

        console.log('天气数据获取完毕，正在请求 DeepSeek 进行 AI 润色排版...');

        // 2. 调用 DeepSeek 接口生成贴心的文案
        const todayStr = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        const prompt = `
请你扮演一个深情、细心、温柔的完美男友，根据我下面提供的【今日真实天气数据】，帮我写一段发给女朋友的早晨微信问候消息。
她目前关注的城市是【济宁】和【济南】女朋友在济宁 目前是异地。
当前时间是：${todayStr}

要求：
1. 语气必须极度宠溺、自然，千万不能有任何“人工智障”的机器味。可以用“宝宝”、“乖乖”、“公主”等甜甜的称呼。
2. 根据天气情况，给出贴心的穿衣或出行建议。
3. 如果下雨，下雪或者异常天气（重要关注点），一定要多嘱咐几句让她带伞，别淋湿了，和安全注意事项。
4. 结尾加一句甜甜的情话作为早安的收尾，比如有多想她之类的话。
5. 运用适当的可爱 Emoji 图标让文字看起来生动。
6. 【重要】纯文本即可，不要输出任何多余的开头解释或结尾说明，不要使用 Markdown（*或#）这类复杂的排版符号，主要以微信普通文本的换行样式为主。
7. 完整展示济南和济宁的天气详细情况 换行展示（这个不需要按照第6条直接展示获取的天气数据）
8. 【最重要】你的回答必须严格分为两部分。第一部分是一行不超过 15 个字的情侣早安短标题（需包含 Emoji，如果是雨雪天必须在标题里加急提醒）；从第二行开始是正文内容。
9. 【特别要求】现在是一次全新的对话，你不拥有任何历史记忆，请给我一份独一无二的有创意的文案，绝对不能和以往说的话雷同。

今日真实天气数据（必须基于这个客观数据来写提醒，不要自己瞎编天气）：
${weatherInfoRaw}
`;

        const deepseekRes = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: '你是一个宠溺女朋友的细心暖男，且没有前世记忆，每天都能变着法子说情话。' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.85, // 提高温度，让模型更具创意
                presence_penalty: 0.3 // 增加新意，减少常见词复用
            })
        });

        const deepseekData = await deepseekRes.json();

        if (!deepseekData.choices || !deepseekData.choices[0]) {
            throw new Error('DeepSeek API 请求异常: ' + JSON.stringify(deepseekData));
        }

        // 提取 AI 生成的润色文案
        const aiFullResponse = deepseekData.choices[0].message.content.trim();

        // 按照换行符分割，第一行作为标题，其余作为正文
        const nlIndex = aiFullResponse.indexOf('\n');

        let finalTitle = '🌤️ 早安宝宝，今日份的温暖请查收~';
        let aiDesp = aiFullResponse;

        if (nlIndex !== -1) {
            finalTitle = aiFullResponse.substring(0, nlIndex).trim();
            aiDesp = aiFullResponse.substring(nlIndex + 1).trim();
        }

        console.log(`生成的标题: ${finalTitle}`);
        console.log('DeepSeek 润色生动问候语完成，准备通过 Server酱 推送...');

        // 3. 调用 Server酱 API 推送经 AI 润色后的消息
        // 如果环境变量里有多个 KEY（逗号分隔），将其拆分成数组
        const sendKeys = SERVER_CHAN_SENDKEY.split(',').map(k => k.trim()).filter(Boolean);

        for (const key of sendKeys) {
            const serverChanUrl = `https://sctapi.ftqq.com/${key}.send`;
            const pushRes = await fetch(serverChanUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: finalTitle,
                    desp: aiDesp // 使用 AI 返回的优美排版文本
                })
            });

            const pushResult = await pushRes.json();
            if (pushResult.code === 0) {
                console.log(`✅ Server酱推送成功！(Key: ${key.substring(0, 8)}...)`);
            } else {
                console.error(`❌ Server酱推送失败 (Key: ${key.substring(0, 8)}...)：`, pushResult.message);
            }
        }

    } catch (error) {
        console.error('⚠️ 脚本运行出错：', error);
    }
}

// 运行程序
getWeatherAndPushWithAI();
