
// 引入 dotenv 并配置
require('dotenv').config();

// 下面是你原来的代码，完全不用动
const WEATHER_API_KEY = process.env.WEATHER_API_KEY;
const SERVER_CHAN_SENDKEY = process.env.SERVER_CHAN_SENDKEY;


// 你需要推送的多个城市
const CITIES = [
    { name: '济南', id: '101120101' },
    { name: '济宁', id: '101120701' }
];

async function getWeatherAndPush() {
    try {
        let allDesp = '### 早上好！今日天气概况\n';
        let commonTitle = '🌤️ 今日天气播报';

        // 1. 遍历获取多个城市天气数据
        for (const city of CITIES) {
            const weatherUrl = `https://devapi.qweather.com/v7/weather/3d?location=${city.id}&key=${WEATHER_API_KEY}`;
            const weatherRes = await fetch(weatherUrl);
            const weatherData = await weatherRes.json();

            if (weatherData.code !== '200') {
                console.error(`天气接口报错 (${city.name}): ${weatherData.code}`);
                continue; // 如果某个城市获取失败，跳过它继续获取下一个
            }

            const today = weatherData.daily[0];
            console.log(`${city.name} 的天气获取成功`);

            // 2. 获取24小时预报分析降雨时间段
            let rainTip = '';
            try {
                const hourlyUrl = `https://devapi.qweather.com/v7/weather/24h?location=${city.id}&key=${WEATHER_API_KEY}`;
                const hourlyRes = await fetch(hourlyUrl);
                const hourlyData = await hourlyRes.json();

                if (hourlyData.code === '200') {
                    // 过滤出文本里带“雨”或“雪”的时间点
                    const rainHours = hourlyData.hourly.filter(h => h.text.includes('雨') || h.text.includes('雪') || parseFloat(h.precip) > 0);
                    if (rainHours.length > 0) {
                        const times = rainHours.map(h => {
                            const match = h.fxTime.match(/T(\d{2}:\d{2})/);
                            return match ? match[1] : '';
                        }).filter(Boolean);

                        // 简化连续时间段 (例如把 '08:00', '09:00', '10:00' 变成 '08:00~10:00')
                        let timeRanges = [];
                        let start = times[0];
                        let prev = times[0];
                        for (let i = 1; i < times.length; i++) {
                            const currHour = parseInt(times[i].split(':')[0], 10);
                            const prevHour = parseInt(prev.split(':')[0], 10);
                            // 如果是连续的一个小时
                            if (currHour === prevHour + 1 || (prevHour === 23 && currHour === 0)) {
                                prev = times[i];
                            } else {
                                timeRanges.push(start === prev ? start : `${start}~${prev}`);
                                start = times[i];
                                prev = times[i];
                            }
                        }
                        timeRanges.push(start === prev ? start : `${start}~${prev}`);

                        rainTip = `\n* **☔️ 降水提醒**：预计在 **${timeRanges.join('、')}** 时段有降水，出门别忘了带伞哦！`;
                        commonTitle = '🌧️ 今日有降水，请注意带伞！'; // 顺便把推送大标题改为显眼的下雨提醒
                    }
                }
            } catch (err) {
                console.error(`获取逐小时天气出错 (${city.name}):`, err);
            }

            // 3. 拼接每个城市的天气信息
            allDesp += `
#### ${city.name}
* **白天天气**：${today.textDay}
* **夜间天气**：${today.textNight}
* **温度区间**：${today.tempMin}℃ ~ ${today.tempMax}℃
* **相对湿度**：${today.humidity}%
* **风向风力**：${today.windDirDay} ${today.windScaleDay}级${rainTip}
`;
        }

        allDesp += `\n> 祝你今天代码无 Bug！💻\n`;

        // 3. 调用 Server酱 API 推送合并后的消息
        const serverChanUrl = `https://sctapi.ftqq.com/${SERVER_CHAN_SENDKEY}.send`;
        const pushRes = await fetch(serverChanUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: commonTitle,
                desp: allDesp // desp 支持 Markdown 渲染，效果很好看
            })
        });

        const pushResult = await pushRes.json();
        if (pushResult.code === 0) {
            console.log('✅ Server酱推送成功！');
        } else {
            console.error('❌ Server酱推送失败：', pushResult.message);
        }

    } catch (error) {
        console.error('⚠️ 脚本运行出错：', error);
    }
}

getWeatherAndPush();
