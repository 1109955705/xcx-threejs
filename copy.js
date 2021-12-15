const fs = require('fs-extra');

async function copy(src, dest) {
  try {
    await fs.copy(src, dest, {
      overwrite: true,
      errorOnExist: true
    });
    return true;
  } catch (error) {
    throw error;
  }
}

const src = './build/three.min.js';
const targetSrc = '../../WeChatProjects/minicode-4/libs/three.min.js';
// const src = './build/three.js';
// const targetSrc = '../../WeChatProjects/minicode-4/libs/three.js';
copy(src, targetSrc);
