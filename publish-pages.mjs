import {spawnSync} from 'node:child_process';
function git(args){const r=spawnSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});if(r.status!==0)throw Error(r.stderr||r.stdout);return r.stdout.trim();}
// Split the static build without rewriting the source branch or force-pushing.
const sha=git(['subtree','split','--prefix=dist','HEAD']);
console.log(git(['push','github',`${sha}:refs/heads/gh-pages`]));
