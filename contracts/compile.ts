import { Compiler } from '@algorandfoundation/tealscript';
import fs from 'fs';
import path from 'path';

const content = fs.readFileSync(path.join(__dirname, 'GigEscrow.algo.ts'), 'utf-8');
const compiler = new Compiler({
    filename: path.join(__dirname, 'GigEscrow.algo.ts'),
    src: content,
    disableWarnings: true,
    cwd: __dirname
});

compiler.compile().then(() => {
    compiler.algodCompiler(); // this fails without algod, let's just write the JSON artifact
    fs.writeFileSync(path.join(__dirname, 'GigEscrow.json'), JSON.stringify(compiler.appSpec(), null, 2));
}).catch(e => console.error(e));
