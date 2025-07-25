import path from 'node:path';
import fs from 'fs-extra';

const packagePath = process.cwd();
const buildPath = path.join(packagePath, './dist');

const packageJsonData = await fs.readFile(
  path.resolve(packagePath, './package.json'),
  'utf8'
);
const packageJson = JSON.parse(packageJsonData);

// "main": "./index.cjs",
// "module": "./index.js",
// "types": "./index.d.ts",
// "browser": "./index.global.js",
// "exports": {
//   ".": {
//     "types": "./index.d.ts",
//     "browser": "./index.global.js",
//     "import": "./index.js",
//     "require": "./index.cjs"
//   }
// },

// Modify the package.json object
packageJson.main = './index.cjs';
packageJson.module = './index.js';
packageJson.types = './index.d.ts';
packageJson.browser = './index.global.js';
packageJson.exports = {
  '.': {
    types: './index.d.ts',
    browser: './index.global.js',
    import: './index.js',
    require: './index.cjs',
  },
  './*': {
    types: './*.d.ts',
    import: './*.js',
    require: './*.cjs',
  },
};

// Remove devDependencies and scripts
delete packageJson.devDependencies;
delete packageJson.scripts;

// Write the modified package.json to the build folder
await fs.writeJson(path.resolve(buildPath, './package.json'), packageJson, {
  spaces: 2,
});

console.log('package.json has been modified and copied to the build folder.');
