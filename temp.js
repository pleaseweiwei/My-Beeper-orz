const fs = require('fs');
const content = fs.readFileSync('js/app_groupchat.js', 'utf-8');
const idx = content.indexOf("addChatListEntry(groupId, group.name, previewMsg, avatarUrl, 'group')");
fs.writeFileSync('temp_out.txt', content.substring(Math.max(0, idx-500), idx+200));
