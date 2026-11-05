const fs = require('fs');
const logPath = 'c:/Users/Yraser/.gemini/antigravity/brain/f4bb9784-96a4-4528-941d-acb373ce4cec/.system_generated/logs/transcript.jsonl';
const data = fs.readFileSync(logPath, 'utf-8').split('\n');
for (const line of data) {
    if (line.includes('"step_index":461')) {
        const step = JSON.parse(line);
        if (step.tool_calls && step.tool_calls[0]) {
            fs.writeFileSync('c:/Proyectos/PROJECT YAXSEL/web-store/recovered_script.js', step.tool_calls[0].args.CodeContent);
        }
        break;
    }
}
