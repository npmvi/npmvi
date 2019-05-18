var PATH_MODULE = require('path');
var FS_MODULE = require('fs');
var CWD = process.cwd();

var argvCmd = process.argv[2];
var moduleName = null;
var moduleVersion = null;
if (argvCmd === 'install') {
  if (process.argv[3]) {
    var mAndV = process.argv[3].split('@');
    if (mAndV) {
      moduleVersion = mAndV[mAndV.length - 1];
      moduleName = mAndV[mAndV.length - 2];
    }
  } else {
    // else, install by package.json
  }
} else if (argvCmd === 'remove') {
  if (process.argv[3]) {
    var mAndV = process.argv[3].split('@');
    if (mAndV) {
      moduleVersion = mAndV[mAndV.length - 1];
      moduleName = mAndV[mAndV.length - 2];
    }
  } else {
    process.stderr.write('🤷‍♂️ Need package@version!\n');
    process.exit(1);
  }
} else {
  process.stdout.write('invalid option: ' + argvCmd + '\n');
  process.exit(1);
}

var packageJSONPath = getPackageJSONPathNearest(CWD);
// var moduleDirectory = getModuleDirectoryNearest(CWD);
if (!packageJSONPath) {
  // create this current work directory
  packageJSONPath = PATH_MODULE.resolve(CWD, './package.json');
}

if (argvCmd === 'install') {
  if (moduleName && moduleVersion) {
    // install by command line  
    installPackage(packageJSONPath, moduleName, moduleVersion, (closeCode) => {
      if (closeCode) {
        process.stderr.write('🙀 Failed! '+ moduleName + '@' + moduleVersion + '\n');
        process.exit(closeCode);
      }
      addFieldToJSON(packageJSONPath, moduleName, moduleVersion);
      process.stdout.write('🤘 Done! '+ moduleName + '@' + moduleVersion + '\n');
    });
  } else {
    // install by package.json
    // installPackageByJSON(packageJSONPath);
    var json = require(packageJSONPath);
    if (json['@npmvi'] && json['@npmvi'].dependencies) {
      var depend = [].concat(json['@npmvi'].dependencies); // shallow array clone
      (function installStep() {
        var nextPackageInfo = depend.pop();
        if (nextPackageInfo) {
          process.stdout.write('👇 Ready to install! '+ nextPackageInfo.package + '@' + nextPackageInfo.version + '\n');
          installPackage(packageJSONPath, nextPackageInfo.package, nextPackageInfo.version, (closeCode, installedPackageInfo) => {
            if (closeCode) {
              process.stderr.write('🙀 Failed! '+ installedPackageInfo.package + '@' + installedPackageInfo.version + '\n');
              process.exit(closeCode);
            }
            if (installedPackageInfo) process.stdout.write('☝️ Done! '+ installedPackageInfo.package + '@' + installedPackageInfo.version + '\n\n');
            installStep();
          });
        } else {
          process.stdout.write('👏 All Done!\n');
        }
      })();
    }
  }
} else if (argvCmd === 'remove') {
  if (moduleName && moduleVersion) {
    removePackage(packageJSONPath, moduleName, moduleVersion);
  }
}

function installPackage(packageJSONPath, package, version, cb) {
  cb = cb || (() => {});
  //find package.json path
  var nodeModuleDirectory = PATH_MODULE.resolve(packageJSONPath, '../node_modules');
  var npmviPackagePath = makeNPMVIDirectoryInModuleDirectory(nodeModuleDirectory);
  
  var fakePackageDirectory = makeFakeProject(npmviPackagePath, package, version);
  npmInstall(fakePackageDirectory, (closeCode) => {
    cb(closeCode || null, {
      package, version,
    })
  });
}

function removePackage(packageJSONPath, package, version) {
  var nodeModuleDirectory = PATH_MODULE.resolve(packageJSONPath, '../node_modules/@npmvi/' + package + '-' + version);
  // FS_MODULE.unlinkSync(nodeModuleDirectory);
  removeDirectory(nodeModuleDirectory);
  return removeFieldFromJSON(packageJSONPath, package, version);
}

function addFieldToJSON(filePath, package, version) {
  var packageJSON = require(filePath);
  packageJSON['@npmvi'] = packageJSON['@npmvi'] || {};
  var npmviNode = packageJSON['@npmvi'];
  npmviNode.dependencies = npmviNode.dependencies || [];

  npmviNode.dependencies = npmviNode.dependencies.filter((m) => {
    return m.package !== package || m.version !== version;
  });

  npmviNode.dependencies.push({
    package,
    version,
  });
  FS_MODULE.writeFileSync(filePath, JSON.stringify(packageJSON, null, 2));
}

function removeFieldFromJSON(filePath, package, version) {
  var packageJSON = require(filePath);
  packageJSON['@npmvi'] = packageJSON['@npmvi'] || {};
  var npmviNode = packageJSON['@npmvi'];
  npmviNode.dependencies = npmviNode.dependencies || [];
  npmviNode.dependencies = npmviNode.dependencies.filter((m) => {
    return m.package !== package || m.version !== version;
  });
  FS_MODULE.writeFileSync(filePath, JSON.stringify(packageJSON, null, 2));
}

function getPackageJSONPathNearest(path) {
  var isFound = false;
  var packagePath = null;
  if (!PATH_MODULE.isAbsolute(path)) throw new Error('path '+ path + ' is not a absolute path');
  var resolvePath = [path];
  while(!isFound) {
    isFound = false;
    var filePath = PATH_MODULE.resolve.apply(this, [].concat(resolvePath, './package.json'));
    if (filePath === packagePath) { // done
      isFound = false;
      break;
    }
    packagePath = filePath;
    if (FS_MODULE.existsSync(packagePath) && FS_MODULE.statSync(packagePath).isFile()) {
      isFound = true;
      break;
    }
    resolvePath.push('../');
  }
  return isFound ? packagePath : null;
}

function getModuleDirectoryNearest(path) {
  var isNodeModuleDirectoryFound = false;
  var nodeModuleDirectory = null;
  if (!PATH_MODULE.isAbsolute(path)) throw new Error('path '+ path + ' is not a absolute path');
  var resolvePath = [path];
  while(!isNodeModuleDirectoryFound) {
    isNodeModuleDirectoryFound = false;
    var modulePath = PATH_MODULE.resolve.apply(this, [].concat(resolvePath, './node_modules'));
    if (modulePath === nodeModuleDirectory) { // done
      isNodeModuleDirectoryFound = false;
      break;
    }
    nodeModuleDirectory = modulePath;
    if (FS_MODULE.existsSync(nodeModuleDirectory)) {
      var stat = FS_MODULE.statSync(nodeModuleDirectory);
      if (stat.isDirectory()) {
        isNodeModuleDirectoryFound = true;
        break;
      }
    }
    resolvePath.push('../');
  }
  return isNodeModuleDirectoryFound ? nodeModuleDirectory : null;
}

function makeNPMVIDirectoryInModuleDirectory(moduleDirectory) {
  var path = PATH_MODULE.resolve(moduleDirectory, './@npmvi');
  FS_MODULE.mkdirSync(path, {recursive: true});
  return path;
}

function makeFakeProject(path, moduleName, version) {

  // create project directory
  var moduleAndVer = PATH_MODULE.resolve(path, './' + moduleName + '-' + version);
  FS_MODULE.mkdirSync(moduleAndVer, {recursive: true});

  // copy the package.json and the index.js file
  var packageTmp = require('./tmp.package.json');
  packageTmp.name = '@npmvi/' + moduleName + '-' + version;
  packageTmp.dependencies = packageTmp.dependencies || {};
  packageTmp.dependencies[moduleName] = version;
  var packageFilePath = PATH_MODULE.resolve(moduleAndVer, './package.json');
  FS_MODULE.writeFileSync(packageFilePath, JSON.stringify(packageTmp));

  // copy index.js
  var indexFilePath = PATH_MODULE.resolve(moduleAndVer, './index.js');
  FS_MODULE.copyFileSync('./tmp.index.js', indexFilePath);
  return moduleAndVer;
}

function npmInstall(packageDirectory, cb) {
  cb = cb || function() {};
  var child_process = require('child_process');
  var cp = child_process.exec('npm install', {
    cwd: packageDirectory,
  });
  cp.stdout.pipe(process.stdout);
  cp.stderr.pipe(process.stderr);
  // cp.stdout.on('data', (data) => {
  //   process.stdout.write(data);
  // });
  // cp.stderr.on('data', (data) => {
  //   process.stderr.write(data);
  // });
  cp.on('close', (closeCode)=> {
    cb(closeCode || null);
  });

}

function removeDirectory(path) {
  var fs = FS_MODULE;
  if (fs.existsSync(path)) {
    fs.readdirSync(path).forEach(function(file, index){
      var curPath = path + "/" + file;
      if (fs.lstatSync(curPath).isDirectory()) { // recurse
        removeDirectory(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(path);
  }
}