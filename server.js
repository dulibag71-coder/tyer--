require('dotenv').config();
const express = require('express');
const { Client } = require('@notionhq/client');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); // Serve static files from 'public' directory

// Notion Client Logic
const notion = new Client({ auth: process.env.NOTION_API_KEY });

const DB = {
    USERS: process.env.NOTION_DB_USERS_ID,
    LEVEL_ENGINE: process.env.NOTION_DB_LEVEL_ENGINE_ID,
    SWING_ANALYSIS: process.env.NOTION_DB_SWING_ANALYSIS_ID,
    MISSIONS: process.env.NOTION_DB_MISSIONS_ID
};

// --- API Endpoints ---

// 1. Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Golf AI System is running' });
});

// 2. Get All Users
app.get('/api/users', async (req, res) => {
    try {
        const response = await notion.databases.query({
            database_id: DB.USERS,
            sorts: [
                {
                    property: 'Name',
                    direction: 'ascending',
                },
            ],
        });

        const users = response.results.map(page => {
            return {
                id: page.id,
                name: page.properties.Name.title[0]?.plain_text || 'Unnamed',
                level: page.properties.Level.select?.name || '1',
                status: page.properties['Level Status'].select?.name || 'IN_PROGRESS',
                growthIndex: page.properties['Growth Index'].number || 0
            };
        });

        console.log('Fetched Users:', JSON.stringify(users, null, 2)); // DEBUG LOG

        res.json(users);
    } catch (error) {
        console.error('Error details:', error); // DETAILED LOG
        res.status(500).json({ error: 'Failed to fetch users from Notion' });
    }
});

// 3. Get User Details
app.get('/api/users/:id', async (req, res) => {
    const userId = req.params.id;
    try {
        const page = await notion.pages.retrieve({ page_id: userId });
        res.json(page);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch user details' });
    }
});

// 3.5 Create New User (Auto-Signup) with LIMIT
app.post('/api/users', async (req, res) => {
    const { name } = req.body;
    try {
        // [LIMIT CHECK] Check current user count
        const existingUsers = await notion.databases.query({
            database_id: DB.USERS,
            page_size: 100 // Fetch enough to check limit
        });

        if (existingUsers.results.length >= 20) {
            return res.status(403).json({
                error: "LIMIT_REACHED",
                message: "선착순 20명 모집이 마감되었습니다. 다음 기수를 기다려주세요!"
            });
        }

        // Proceed if under limit
        const response = await notion.pages.create({
            parent: { database_id: DB.USERS },
            properties: {
                "Name": { title: [{ text: { content: name } }] },
                "Level": { select: { name: "1" } },
                "Level Status": { select: { name: "IN_PROGRESS" } },
                "Growth Index": { number: 0 }
            }
        });
        res.json({ message: "User created", data: response });
    } catch (error) {
        console.error("Create User Error:", error);
        res.status(500).json({ error: "Failed to create user" });
    }
});

// 3.6 Update User Level (Admin)
app.patch('/api/users/:id/level', async (req, res) => {
    const { level } = req.body; // e.g., "Pro", "Elite"
    const userId = req.params.id;

    try {
        const response = await notion.pages.update({
            page_id: userId,
            properties: {
                "Level": { select: { name: level } }
            }
        });
        res.json({ message: "Level updated", data: response });
    } catch (error) {
        console.error("Update Level Error:", error);
        res.status(500).json({ error: "Failed to update level" });
    }
});

// 4. Submit Swing Analysis (Enhanced AI Logic)
app.post('/api/analyze', async (req, res) => {
    const { userId, level, addressScore, balanceScore, swingPath, impactTiming } = req.body;

    // --- AI Logic Engine ---
    let aiComment = "";
    let consistencyScore = 50; // Base score

    // 1. Address Analysis
    const addr = parseInt(addressScore);
    if (addr >= 40 && addr <= 55) {
        aiComment += "어드레스 각도가 아주 이상적입니다. ";
        consistencyScore += 10;
    } else if (addr < 40) {
        aiComment += "어드레스가 너무 낮습니다(Squat). 상체를 조금 더 세우세요. ";
    } else {
        aiComment += "상체가 너무 서 있습니다. 척추각을 유지하세요. ";
    }

    // 2. Balance Analysis
    const bal = parseInt(balanceScore);
    if (bal > 80) {
        aiComment += "밸런스가 프로 선수 급입니다! ";
        consistencyScore += 20;
    } else if (bal > 60) {
        aiComment += "중심 이동이 안정적입니다. ";
        consistencyScore += 10;
    } else {
        aiComment += "피니시 때 중심을 못 잡고 있습니다. 코어 운동이 필요합니다. ";
        consistencyScore -= 10;
    }

    // 3. Path & Timing
    if (swingPath === 'Out-In' && impactTiming === 'Late') {
        aiComment += "슬라이스(Slice)가 발생할 확률이 90%입니다. 그립을 점검하세요.";
        consistencyScore -= 20;
    } else if (swingPath === 'In-Out' && impactTiming === 'Early') {
        aiComment += "심한 훅(Hook)이 발생할 수 있습니다. 하체 회전을 더 빠르게 하세요.";
        consistencyScore -= 10;
    } else if (impactTiming === 'Good') {
        aiComment += "임팩트 타이밍이 완벽합니다. 비거리가 기대됩니다.";
        consistencyScore += 10;
    }

    consistencyScore = Math.max(0, Math.min(100, consistencyScore)); // Clamp 0-100

    try {
        const response = await notion.pages.create({
            parent: { database_id: DB.SWING_ANALYSIS },
            properties: {
                "User": { relation: [{ id: userId }] },
                "Level": { number: parseInt(level) },
                "Analysis Name": { title: [{ text: { content: `Analysis ${new Date().toLocaleString()}` } }] },
                "Address Angle": { number: addr },
                "Balance Score": { number: bal },
                "Swing Path": { select: { name: swingPath || "Neutral" } },
                "Impact Timing": { select: { name: impactTiming || "Good" } },
                "Consistency Score": { number: consistencyScore },
                "AI Comment": { rich_text: [{ text: { content: aiComment } }] }
            }
        });

        // Return calculated data so frontend doesn't need to re-fetch
        res.json({
            message: 'Analysis saved successfully',
            data: response,
            aiResult: {
                score: consistencyScore,
                comment: aiComment
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to save analysis to Notion' });
    }
});

// 5. AI Coach Chat API (Mock AI)
app.post('/api/chat', async (req, res) => {
    const { userId, message } = req.body;
    const msg = message.toLowerCase();

    let reply = "죄송합니다. 아직 배우고 있는 중이라 정확한 답변을 드리기 어렵습니다.";

    // Simple Role-Playing Logic
    if (msg.includes('슬라이스') || msg.includes('오른쪽')) {
        reply = "슬라이스의 주 원인은 '아웃-인 궤도'와 '열린 페이스'입니다. 어드레스 때 오른발을 살짝 뒤로 빼는 '클로즈 스탠스'를 시도해보세요.";
    } else if (msg.includes('비거리') || msg.includes('멀리')) {
        reply = "비거리를 늘리려면 '힘'보다는 '스피드'가 중요합니다. 다운스윙 시작 때 골반을 먼저 회전시키는 '지면 반력'을 연습하세요.";
    } else if (msg.includes('생크') || msg.includes('안쪽')) {
        reply = "생크는 공과 너무 가까이 섰거나, 손이 몸에서 멀어질 때 발생합니다. 공과 반 발자국만 떨어져서 서보세요.";
    } else if (msg.includes('퍼팅') || msg.includes('그린')) {
        reply = "퍼팅은 '거리감'이 생명입니다. 홀컵을 보지 말고, 공이 굴러가는 상상만 하며 빈 스윙을 3번 해보세요.";
    } else if (msg.includes('안녕') || msg.includes('ㅎㅇ')) {
        reply = "안녕하세요! 당신의 AI 골프 코치입니다. 오늘 컨디션은 어떠신가요?";
    }

    // Simulate Network Delay (AI Thinking)
    setTimeout(() => {
        res.json({ reply: reply });
    }, 1000); // 1.0s delay
});

// Debug: List all databases & Check Users DB Schema
(async () => {
    try {
        console.log("Checking DB Schema for:", DB.USERS);
        const db = await notion.databases.retrieve({ database_id: DB.USERS });
        console.log("Users DB Properties:", Object.keys(db.properties));

        // Also try querying without sort to be safe
        const q = await notion.databases.query({ database_id: DB.USERS });
        console.log("Query Result Count (No Sort):", q.results.length);

    } catch (e) {
        console.error('Schema check failed:', e);
    }
})();

// 6. Export for Vercel (Serverless)
// Vercel requires exporting the app logic, but local run needs app.listen
if (require.main === module) {
    app.listen(port, () => {
        console.log(`Golf AI System Server running on http://localhost:${port}`);
    });
}

module.exports = app;
