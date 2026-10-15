import { GIDS } from '../config.js';
import { parseCSV } from './csv.js';
import { validateSheet } from './validation.js';
import * as parsers from './parsers.js';
export function buildSnapshot(texts){
  const next={};
  for(const key of Object.keys(GIDS)){
    let rows;
    try{rows=parseCSV(texts?.[key]);}catch(e){throw new Error(`${key}: ${e.message}`);}
    validateSheet(key,rows);
    next[key]=parsers['parse'+key[0].toUpperCase()+key.slice(1)](rows);
  }
  return next;
}
