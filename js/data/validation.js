import { columnIndex, matchesColumn } from './columns.js';
import { cell, dt, num } from '../utils.js';

export const CONTRACTS = {
  dash: ['Місто','R56','R90','R180','R365','Історична база','Сила домінанти','Оперативний %','Остання атака','A-only R365'],
  tactics: ['Місто','Вікно','Епізодів','Балістика','Крилаті','БпЛА','Онікс','Бандероль','Інші ракети','Комбіновані','Частка'],
  cal: ['Дата','Місто','Покриття','Балістична атака','К-сть','Regime'],
  reg: ['ID епізоду','Місто','Категорія','Дата балістичної','Короткий опис'],
  waves: ['Дата після 00:00','День','Ніч від','БпЛА','Балістична складова','Склад','Джерело','Місяць','Include','Клас'],
};
const missing = v => ['', '—', '-'].includes(String(v??'').trim());
function fail(sheet,row,column,reason){throw new Error(`${sheet}: рядок ${row}, стовпець «${column}»: ${reason}`);}
export function validateSheet(sheet,rows){
  if(!rows.length) fail(sheet,1,'CSV','порожня відповідь без заголовків');
  let hi=0;
  if(sheet==='dash') hi=rows.findIndex(r=>cell(r,0)==='Місто'&&cell(r,1)==='R56');
  if(sheet==='ops'){
    hi=rows.findIndex(r=>cell(r,0)==='Фактор');
    if(hi<0) fail(sheet,1,'Фактор','немає заголовка');
    return;
  }
  if(sheet==='control'){
    if(!rows.some(r=>cell(r,0)==='Місто'&&cell(r,1).startsWith('N STAT'))) fail(sheet,1,'Місто / N STAT','немає заголовка');
    return;
  }
  if(hi<0) fail(sheet,1,'Місто / R56','немає заголовка');
  const H=rows[hi].map(v=>v.trim());
  const ix=name=>columnIndex(H,name);
  for(const name of CONTRACTS[sheet]){
    if((sheet==='dash'?H.indexOf(name):ix(name))<0) fail(sheet,hi+1,name,'обов’язковий стовпець відсутній');
    if(H.filter(h=>matchesColumn(h,name)).length>1) fail(sheet,hi+1,name,'неоднозначний заголовок');
  }
  const check=(r,i,name,type,required=false)=>{
    const raw=cell(r,ix(name));
    if(missing(raw)){if(required) fail(sheet,i+1,name,'значення відсутнє'); return;}
    if(type==='date'){if(!dt(raw)) fail(sheet,i+1,name,'некоректна дата'); return;}
    const v=num(raw);
    if(v==null || (type==='prob'&&(v<0||v>1)) || (type==='count'&&(!Number.isInteger(v)||v<0)) || (type==='binary'&&v!==0&&v!==1)) fail(sheet,i+1,name,'некоректне числове значення');
  };
  if(sheet==='dash'){
    const target=rows.findIndex(r=>cell(r,0)==='Цільова дата');
    if(target<0||!dt(cell(rows[target],1))) fail(sheet,target+1,'Цільова дата','некоректна або відсутня дата');
  }
  const seen=new Set();
  for(let i=hi+1;i<rows.length;i++){
    const r=rows[i];
    if(sheet==='dash'&&(!cell(r,0)||['Метод','Режим'].includes(cell(r,0)))) break;
    if(sheet==='waves'&&!cell(r,ix('Дата після 00:00'))) continue; // independent metadata in right-hand columns
    if(!r.some(v=>v.trim())) continue;
    if(sheet==='dash'){
      for(const n of ['R56','R90','R180','R365','Історична база','Сила домінанти','Оперативний %','A-only R365']) check(r,i,n,'prob');
      check(r,i,'Остання атака','date');
    }
    if(['cal','reg','tactics'].includes(sheet)&&!cell(r,ix('Місто'))) fail(sheet,i+1,'Місто','значення відсутнє');
    if(sheet==='cal'){
      check(r,i,'Дата','date',true); check(r,i,'Балістична атака','binary'); check(r,i,'К-сть','count');
      const key=cell(r,ix('Місто'))+'|'+dt(cell(r,ix('Дата'))).getTime();
      if(seen.has(key)) fail(sheet,i+1,'Дата','дублікат дати для міста'); seen.add(key);
    }
    if(sheet==='reg') check(r,i,'Дата балістичної','date',true);
    if(sheet==='tactics'){
      for(const n of ['Вікно','Епізодів','Балістика','Крилаті','БпЛА','Онікс','Бандероль','Інші ракети','Комбіновані']) check(r,i,n,'count');
      check(r,i,'Частка','prob');
    }
    if(sheet==='waves'){check(r,i,'Дата після 00:00','date',true);check(r,i,'БпЛА','count');check(r,i,'Include','binary');}
  }
}
