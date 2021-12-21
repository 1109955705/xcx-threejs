var qiniu = require("qiniu");
var fs = require("fs");
var path = require("path");

const zone_map = {
  华东: qiniu.zone.Zone_z0,
  华北: qiniu.zone.Zone_z1,
  华南: qiniu.zone.Zone_z2,
  北美: qiniu.zone.Zone_na0,
};

class UploadPromise {
  constructor({ file, key, token, qiniu_config, total, current }) {
    this.file = file;
    this.key = key;
    this.token = token;
    this.qiniu_config = qiniu_config;
    this.total = total;
    this.current = current;
  }

  upload() {
    return new Promise((resolve, reject) => {
      if (!this.key) {
        this.key = path.baseName(this.file);
      }
      const formUploader = new qiniu.form_up.FormUploader(this.qiniu_config);
      const putExtra = new qiniu.form_up.PutExtra();
      console.log(`当前进度：${this.current} / ${this.total} `);
      formUploader.putFile(
        this.token,
        this.key,
        this.file,
        putExtra,
        (err, respBody, respInfo) => {
          if (err) {
            console.log(err);
            reject(err);
          } else {
            resolve(respBody);
          }
        }
      );
    });
  }
}

class QiniuClient {
  constructor(config) {
    this.config = config;
    const accessKey = config.AK;
    const secretKey = config.SK;
    this.bucket = config.bucket;

    this.mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
    this.qiniu_config = new qiniu.conf.Config();
    this.qiniu_config.zone = zone_map[config.zone];

    this.bucketManager = new qiniu.rs.BucketManager(
      this.mac,
      this.qiniu_config
    );
  }

  deleteFile(key) {
    return new Promise((resolve, reject) => {
      this.bucketManager.delete(this.bucket, key, (err, respBody, respInfo) => {
        if (err) {
          console.log(err);

          reject(err);
        } else {
          console.log(respInfo.statusCode);
          console.log(respBody);
          resolve(respBody);
        }
      });
    });
  }

  /**
   * 批量删除文件
   * @param keyArray
   * @returns {Promise<any>}
   */
  batchDelete(keyArray) {
    return new Promise((resolve, reject) => {
      const keys = keyArray.slice(100, 500)
      const deleteOperations = keys.map((key) =>
        qiniu.rs.deleteOp(this.bucket, key)
      );

      this.bucketManager.batch(deleteOperations, (err, respBody, respInfo) => {
        if (err) {
          console.log(err);
          //throw err;
          reject(err);
        } else {
          if (parseInt(respInfo.statusCode / 100) == 2) {
            respBody.forEach(function(item) {
              if (item.code == 200) {
                console.log(item.code + "\tsuccess");
              } else {
                console.log(item.code + "\t" + item.data.error);
              }
            });
          } else {
            console.log(respInfo.deleteusCode);
            console.log(respBody);
          }
          // console.log("清空文件成功");
          // resolve(respBody);
        }
      });
    });
  }

  /**
   * 根据前缀，列出所有文件，如果没有提供prefix 则列出空间中的所有文件
   * @param prefix
   * @returns {Promise<any>}
   */
  listAll(prefix = '') {
    prefix = this.config.prefix + this.config.targetDir ?? ''
    console.log('xxxxxx', prefix)
    return new Promise((resolve, reject) => {
      this.bucketManager.listPrefix(
        this.bucket,
        {
          prefix,
        },
        (err, respBody, respInfo) => {
          if (err) {
            console.log(err);
            reject(err);
          } else {
            resolve(respBody);
          }
        }
      );
    });
  }

  /**
   * 移除空间中所有的文件
   */
  clearAll() {
    return this.listAll()
      .then((fileArray) => {
        if (fileArray.items.length === 0) {
          throw new Error("没有文件");
        }
        return fileArray.items
        .map((item) => item.key)
      })
      .then((keyArray) => this.batchDelete(keyArray))
      .catch((err) => {
        if (err.message !== "没有文件") {
          throw err;
        }
      });
  }

  get uploadToken() {
    var options = {
      scope: this.bucket,
    };
    var putPolicy = new qiniu.rs.PutPolicy(options);
    return putPolicy.uploadToken(this.mac);
  }

  uploadFile(filePath, key = null, uploadToken = this.uploadToken) {
    return new Promise((resolve, reject) => {
      if (!key) {
        key = path.baseName(filePath);
      }
      const formUploader = new qiniu.form_up.FormUploader(this.qiniu_config);
      const putExtra = new qiniu.form_up.PutExtra();

      formUploader.putFile(
        uploadToken,
        key,
        filePath,
        putExtra,
        (err, respBody, respInfo) => {
          if (err) {
            console.log(err);
            reject(err);
          } else {
            resolve(respBody);
          }
        }
      );
    });
  }

  promiseIter(promises) {
    return new Promise((resolve, reject) => {
      nextPromise(0, promises);

      function nextPromise(index, promises) {
        let length = promises.length;
        if (index >= length) {
          resolve();
        }
        promises[index]
          .upload()
          .then(() => {
            nextPromise(index + 1, promises);
          })
          .catch((err) => {
            reject(err);
          });
      }
    });
  }
  /**
   * 批量上传多个文件
   * @param pathArray
   * @param bashFolder
   * @param uploadToken
   * @returns {Promise<number[]>}
   */
  batchUploadFile(pathArray, bashFolder, uploadToken = this.uploadToken) {
    const keys = [];
    const uploadPromise = [];
    console.log('pathArray', pathArray, bashFolder, this.config.prefix)

    for (var i = 0; i < pathArray.length; i++) {
      var file = pathArray[i];
      var key = path.relative(bashFolder, file).replace(/\\/g, "/");
      if (this.config.prefix) {
        key = this.config.prefix + key 
      }
      keys.push(key);

      uploadPromise.push(
        new UploadPromise({
          file,
          key,
          token: this.uploadToken,
          qiniu_config: this.qiniu_config,
          total: pathArray.length,
          current: i + 1,
        })
      );
    }
    // console.log('keys', keys)
    // return
    return this.promiseIter(uploadPromise).then(() => {
      return new Promise((resolve, reject) => {
        let htmls = keys
          .filter((key) => key.endsWith(".html"))
          .map((key) => `https://${this.config.domain}/${key}`);
        var cdnManager = new qiniu.cdn.CdnManager(this.mac);
        cdnManager.refreshUrls(htmls, (err, respBody, respInfo) => {
          if (err) {
            console.log(err);
            reject(err);
          } else {
            resolve(respBody);
          }
        });
      });
    });
  }

  readFolder(folderPath) {
    return Promise.resolve(this.readItemFolder(folderPath));
  }

  readItemFolder(folderPath) {
    const files = fs.readdirSync(folderPath);
    const results = [];
    files.forEach((filename) => {
      if (filename.startsWith(".")) {
        return;
      }
      const filePath = path.resolve(folderPath, filename);

      const stats = fs.statSync(filePath);

      if (stats.isFile()) {
        results.push(filePath);
      } else {
        const subFiles = this.readItemFolder(filePath);

        subFiles.forEach((subFile) => {
          results.push(subFile);
        });
      }
    });

    return results;
  }

  /**
   * 上传一整个文件夹
   * @param folderPath
   * @param uploadToken
   * @returns {*|PromiseLike<number[]>|Promise<number[]>}
   */
  uploadFolder(folderPath, uploadToken = this.uploadToken) {
    return this.readFolder(folderPath).then((files) =>
      this.batchUploadFile(files, folderPath, uploadToken)
    );
  }

  replaceContentWithFolder(folderPath, uploadToken = this.uploadToken) {
    return this.clearAll().then(() =>
      this.uploadFolder(folderPath, uploadToken)
    );
  }

  replaceContentWithFolderAndRefreshCDN(
    folderPath,
    uploadToken = this.uploadToken
  ) {
    return this.replaceContentWithFolder(folderPath, uploadToken).then(() =>
      this.refreshCDN()
    );
  }

  refreshCDN(domain = this.config.domain) {
    const dir = `http://${domain}/`;
    return new Promise((resolve, reject) => {
      var cdnManager = new qiniu.cdn.CdnManager(this.mac);

      cdnManager.refreshDirs([dir], (err, respBody, respInfo) => {
        if (err) {
          console.log(err);
          reject(err);
        } else {
          resolve(respBody);
        }
      });
    });
  }

  autoUpload() {
    const { targetDir } = this.config;
    const folderPath = path.resolve(__dirname, targetDir);
    // console.log('xxxxxxx', __dirname, targetDir, folderPath)

    return this.replaceContentWithFolderAndRefreshCDN(folderPath);
  }
}

module.exports = QiniuClient;
