const config = require('./qiniu_config');
const inquirer = require('inquirer')
const QiniuClient = new require('./qiniu_client.js');
let argv = process.argv[2]

inquirer.prompt([{
    type: "password", // 密码为密文输入
    message: "上传到服务器,请确认是否上传:",
    name: "pwd"
}]).then(res => {
    // if (res.pwd != 'upload') return
    let client = new QiniuClient(config)
    client.autoUpload()
})





   