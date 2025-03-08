const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const zipEncrypted = require('archiver-zip-encrypted');

// רישום פורמט zip-encrypted כך שיהיה זמין לשימוש
archiver.registerFormat('zip-encrypted', zipEncrypted);

// הכנס את הטוקן של הבוט שלך כאן
const token = '6686798170:AAFb9lQ9YeHaxW4hil_DV-QWhLlGFnHnz9c';
const bot = new TelegramBot(token, { polling: true });

// מאזין לשגיאות Polling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

// ספרייה בסיסית לשמירת הקבצים
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir);
}

// אובייקט לניהול מצבי משתמש – לפי chatId
const userState = {};

// אובייקט לאיחוד הודעות media group
const mediaGroupStore = {};

// פונקציה למחיקת כל הקבצים בתיקייה בצורה רקורסיבית
function deleteFolderContents(folderPath) {
  if (!fs.existsSync(folderPath)) return;
  fs.readdirSync(folderPath).forEach(file => {
    const curPath = path.join(folderPath, file);
    if (fs.lstatSync(curPath).isDirectory()) {
      deleteFolderContents(curPath);
      fs.rmdirSync(curPath);
    } else {
      fs.unlinkSync(curPath);
    }
  });
}

// פונקציות עזר לעיבוד קבצים
function processDocument(msg) {
  const chatId = msg.chat.id;
  if (!userState[chatId] || !userState[chatId].waitingForFiles) {
    bot.sendMessage(chatId, 'אנא התחל את תהליך ההעלאה עם /startupload לפני שליחת קבצים.');
    return;
  }
  const fileId = msg.document.file_id;
  const fileName = msg.document.file_name;
  const userDir = userState[chatId].userDir;
  bot.downloadFile(fileId, userDir)
    .then((downloadedFilePath) => {
      const targetPath = path.join(userDir, fileName);
      if (path.basename(downloadedFilePath) !== fileName) {
        fs.rename(downloadedFilePath, targetPath, (err) => {
          if (err) {
            console.error('Error renaming document:', err);
            bot.sendMessage(chatId, `Error renaming file ${fileName}.`);
          } else {
            bot.sendMessage(chatId, `File ${fileName} saved successfully.`);
          }
        });
      } else {
        bot.sendMessage(chatId, `File ${fileName} saved successfully.`);
      }
    })
    .catch(err => {
      console.error(err);
      bot.sendMessage(chatId, `Error downloading file ${fileName}.`);
    });
}

function processPhoto(msg) {
  const chatId = msg.chat.id;
  if (!userState[chatId] || !userState[chatId].waitingForFiles) {
    bot.sendMessage(chatId, 'אנא התחל את תהליך ההעלאה עם /startupload לפני שליחת תמונות.');
    return;
  }
  // msg.photo הוא מערך של תמונות בגודל שונה – נבחר את הגדולה ביותר
  const photoArray = msg.photo;
  const highestRes = photoArray[photoArray.length - 1];
  const fileId = highestRes.file_id;
  // נגדיר שם קובץ על בסיס file_id + סיומת jpg
  const fileName = fileId + '.jpg';
  const userDir = userState[chatId].userDir;
  bot.downloadFile(fileId, userDir)
    .then((downloadedFilePath) => {
      const targetPath = path.join(userDir, fileName);
      if (path.basename(downloadedFilePath) !== fileName) {
        fs.rename(downloadedFilePath, targetPath, (err) => {
          if (err) {
            console.error('Error renaming photo:', err);
            bot.sendMessage(chatId, `Error renaming photo ${fileName}.`);
          } else {
            bot.sendMessage(chatId, `Photo saved successfully as ${fileName}.`);
          }
        });
      } else {
        bot.sendMessage(chatId, `Photo saved successfully as ${fileName}.`);
      }
    })
    .catch(err => {
      console.error(err);
      bot.sendMessage(chatId, `Error downloading photo ${fileName}.`);
    });
}

// טיפול במדיום של media group – איחוד הודעות עם אותו media_group_id
function processMediaGroupMsg(msg) {
  if (msg.document) {
    processDocument(msg);
  } else if (msg.photo) {
    processPhoto(msg);
  }
}

// טיפול בהודעות (למקרה שאין media_group_id)
bot.on('document', (msg) => {
  if (msg.media_group_id) return; // יטופל במדיום
  processDocument(msg);
});

bot.on('photo', (msg) => {
  if (msg.media_group_id) return; // יטופל במדיום
  processPhoto(msg);
});

// איחוד הודעות media group
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  // אם ההודעה היא חלק מ-media group, נאחד אותה
  if (msg.media_group_id) {
    if (!mediaGroupStore[msg.media_group_id]) {
      mediaGroupStore[msg.media_group_id] = [];
      // המתן 1 שנייה לאיסוף כל ההודעות עם אותו media_group_id ואז עבד אותן
      setTimeout(() => {
         mediaGroupStore[msg.media_group_id].forEach(processMediaGroupMsg);
         delete mediaGroupStore[msg.media_group_id];
      }, 1000);
    }
    mediaGroupStore[msg.media_group_id].push(msg);
    return; // אין צורך לעבד את ההודעה בהמשך
  }
  // שאר הודעות טקסט (ללא קבצים) יעברו לטיפול בהמשך
});

// פקודת /startupload - אתחול תהליך העלאת הקבצים
bot.onText(/\/startupload/, (msg) => {
  const chatId = msg.chat.id;
  const userDir = path.join(downloadsDir, chatId.toString());
  
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  } else {
    deleteFolderContents(userDir);
  }
  
  userState[chatId] = { waitingForFiles: true, userDir: userDir };
  bot.sendMessage(chatId, 'תהליך העלאת הקבצים התחיל. שלח את כל הקבצים שברצונך לדחוס. כשתסיים, שלח /finishupload');
});

// פקודת /finishupload - סיום העלאה והתחלת תהליך הדחיסה
bot.onText(/\/finishupload/, (msg) => {
  const chatId = msg.chat.id;
  if (!userState[chatId] || !userState[chatId].userDir) {
    bot.sendMessage(chatId, 'אין תהליך העלאה פעיל. אנא התחל עם /startupload.');
    return;
  }
  const userDir = userState[chatId].userDir;
  fs.readdir(userDir, (err, files) => {
    if (err || files.length === 0) {
      bot.sendMessage(chatId, 'לא נמצאו קבצים לדחיסה.');
      return;
    }
    userState[chatId].waitingForFiles = false;
    userState[chatId].awaitingArchiveName = true;
    bot.sendMessage(chatId, 'אנא הזן את השם שברצונך לתת לקובץ הדחוס (ללא סיומת):');
  });
});

// טיפול בהודעות טקסט עבור שלב בחירת שם לארכיון והוספת סיסמה
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text && msg.text.trim();
  if (msg.media_group_id) return; // הודעות מה-Media Group מטופלות בנפרד
  if (userState[chatId] && userState[chatId].awaitingArchiveName) {
    let archiveName = text;
    if (archiveName.toLowerCase().endsWith('.zip')) {
      archiveName = archiveName.slice(0, -4);
    }
    userState[chatId].archiveName = archiveName;
    userState[chatId].awaitingArchiveName = false;
    userState[chatId].awaitingPasswordConfirmation = true;
    bot.sendMessage(chatId, 'האם תרצה להוסיף סיסמה לארכיון? (כן/לא)');
    return;
  }
  if (userState[chatId] && userState[chatId].awaitingPasswordConfirmation) {
    if (text === 'כן') {
      userState[chatId].awaitingPasswordConfirmation = false;
      userState[chatId].awaitingPassword = true;
      bot.sendMessage(chatId, 'אנא הזן את הסיסמה:');
    } else if (text === 'לא') {
      userState[chatId].awaitingPasswordConfirmation = false;
      compressAndSend(chatId, userState[chatId].userDir, userState[chatId].archiveName, null);
      delete userState[chatId];
    } else {
      bot.sendMessage(chatId, 'אנא השב "כן" או "לא".');
    }
    return;
  }
  if (userState[chatId] && userState[chatId].awaitingPassword) {
    const password = text;
    userState[chatId].awaitingPassword = false;
    compressAndSend(chatId, userState[chatId].userDir, userState[chatId].archiveName, password);
    delete userState[chatId];
    return;
  }
});

// פונקציה לדחיסת הקבצים ושליחת הארכיון עם עדכון התקדמות.
// הקובץ המכווץ נוצר בתיקייה "archive" נפרדת בתוך תיקיית המשתמש.
function compressAndSend(chatId, userDir, archiveName, password) {
  const archiveFolder = path.join(userDir, 'archive');
  if (!fs.existsSync(archiveFolder)) {
    fs.mkdirSync(archiveFolder, { recursive: true });
  }
  const outputZip = path.join(
    archiveFolder,
    archiveName.toLowerCase().endsWith('.zip') ? archiveName : archiveName + '.zip'
  );
  const output = fs.createWriteStream(outputZip);
  
  let archive;
  if (password) {
    archive = archiver('zip-encrypted', {
      zlib: { level: 6 },
      encryptionMethod: 'aes256',
      password: password
    });
  } else {
    archive = archiver('zip', {
      zlib: { level: 6 }
    });
  }
  
  archive.on('error', err => {
    console.error('Archive error:', err);
    bot.sendMessage(chatId, `Error creating archive: ${err.message}`);
  });
  
  output.on('close', () => {
    bot.sendDocument(chatId, outputZip)
      .then(() => {
        bot.sendMessage(chatId, 'Archive created and sent successfully.');
        // לאחר השליחה, מוחקים את כל הקבצים בתיקיית המשתמש (כולל תיקיית "archive")
        deleteFolderContents(userDir);
      })
      .catch(err => {
        console.error(err);
        bot.sendMessage(chatId, 'Error sending archive.');
      });
  });
  
  let lastPercent = 0;
  let progressMessageId;
  bot.sendMessage(chatId, 'Compression started...')
    .then(sentMsg => {
      progressMessageId = sentMsg.message_id;
    })
    .catch(err => console.error('Error sending start message:', err));
  
  archive.on('progress', data => {
    if (data.entries.total > 0) {
      const percent = Math.round((data.entries.processed / data.entries.total) * 100);
      if (percent !== lastPercent) {
        lastPercent = percent;
        bot.editMessageText(`Progress: ${percent}%`, { chat_id: chatId, message_id: progressMessageId })
          .catch(err => console.error('Error updating progress:', err));
      }
    }
  });
  
  archive.pipe(output);
  archive.glob('**/*', {
    cwd: userDir,
    ignore: ['archive/**']
  });
  archive.finalize();
}
