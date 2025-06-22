#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Read package.json
const packagePath = path.join(__dirname, '..', 'package.json');
const package = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

const currentVersion = package.version;

function runCommand(command) {
  try {
    console.log(`Running: ${command}`);
    return execSync(command, { stdio: 'inherit' });
  } catch (error) {
    console.error(`Error running command: ${command}`);
    process.exit(1);
  }
}

function createReleaseNotes(version) {
  const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');
  let changelog = '';
  
  if (fs.existsSync(changelogPath)) {
    changelog = fs.readFileSync(changelogPath, 'utf8');
  } else {
    changelog = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release

`;
  }

  // Add new version entry
  const newEntry = `## [${version}] - ${new Date().toISOString().split('T')[0]}

### Added
- Version ${version} release

`;
  
  const updatedChangelog = changelog.replace('## [Unreleased]', newEntry + '## [Unreleased]');
  fs.writeFileSync(changelogPath, updatedChangelog);
  
  return newEntry;
}

function main() {
  const args = process.argv.slice(2);
  const versionType = args[0] || 'patch';
  
  if (!['patch', 'minor', 'major'].includes(versionType)) {
    console.error('Usage: node scripts/version.js [patch|minor|major]');
    process.exit(1);
  }
  
  console.log(`Current version: ${currentVersion}`);
  console.log(`Bumping ${versionType} version...`);
  
  // Run npm version
  runCommand(`npm version ${versionType} --no-git-tag-version`);
  
  // Read new version
  const newPackage = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const newVersion = newPackage.version;
  
  console.log(`New version: ${newVersion}`);
  
  // Create release notes
  const releaseNotes = createReleaseNotes(newVersion);
  
  // Commit changes
  runCommand('git add .');
  runCommand(`git commit -m "chore: bump version to ${newVersion}"`);
  
  // Create git tag
  runCommand(`git tag -a v${newVersion} -m "Release version ${newVersion}"`);
  
  // Push changes and tags
  runCommand('git push');
  runCommand('git push --tags');
  
  console.log(`\n🎉 Version ${newVersion} has been released!`);
  console.log(`\nRelease notes:`);
  console.log(releaseNotes);
  console.log(`\nNext steps:`);
  console.log(`1. Go to https://github.com/curtismu7/pingone-sample-js/releases`);
  console.log(`2. Click "Draft a new release"`);
  console.log(`3. Select tag v${newVersion}`);
  console.log(`4. Add release notes and publish`);
}

if (require.main === module) {
  main();
}

module.exports = { createReleaseNotes }; 