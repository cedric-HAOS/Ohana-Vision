'use strict';

// Source of the incidents view for the rendering tests: the controller and the
// modules that add their methods to it, concatenated in load order. Imports and
// exports are stripped so the whole view runs in one vm context, where the test
// supplies its own escapeHtml, formatDate and window.
const fs = require('node:fs');

const FILES = [
    'incidents_shared.js',
    'incidents.js',
    'incidents_decisions.js',
    'incidents_experiences.js',
    'incidents_logs.js',
    'incidents_preventive.js',
    'incidents_repairs.js',
];

module.exports = () => FILES
    .map((name) => fs.readFileSync(`src/ohana_vision/web/static/${name}`, 'utf8')
        .replace(/^import\b[^;]*;/gm, '')
        .replace(/^export (?=(?:async )?(?:class|const|function)\b)/gm, ''))
    .join('\n');
