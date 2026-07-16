/* ═══ dotpad-mock — DotPad 모의 SDK + 검증 유틸 (실기기 없이 BLE 계약 테스트) ═══
 * 공식 DotPadSDK 3.0.0과 동일한 인터페이스(DotPadSDK/DotPadScanner/DisplayMode)를 제공한다.
 * 어떤 DotPad 웹앱이든 `BLE.loadSDK=()=>Promise.resolve(sim.module)` 식으로 주입해 쓸 수 있다.
 *
 * API:
 *   createMockSdk()            → sim
 *     sim.module               공식 SDK 모양의 모의 모듈 (동적 import 대체용)
 *     sim.log                  displayLineData 호출 기록 [{dev,lineId,startCell,hex,mode,t}]
 *     sim.order                {callbackSetAt, connectCalledAt} — 콜백 등록/연결 순서 검증용
 *     sim.fireKey(key[,dev])   기기 키 입력 주입 ("PanningLeft/Right","KeyFunction1"~"4")
 *     sim.fireMessage(code,dev) 기기 메시지 주입 ("Connected","Disconnected","ConnectedFail")
 *     sim.deviceState()        행 차분 누적 → 현재 기기 화면(10행 hex). 무전송 행은 0.
 *   rowsToCells(rowHexes)      10행 hex → 셀별 점 배열 (인코딩 bit=y%4+(x%2)*4, 셀 피치 3×4 역산)
 *   makeChecker()              {ok(name,cond,extra), fail, summary()} 어서션 헬퍼
 */
"use strict";

function createMockSdk(){
  const log=[];
  let msgCb=null,keyCb=null,seq=0;
  const order={callbackSetAt:null,connectCalledAt:null};
  class DotPadSDK{
    setCallBack(m,k){msgCb=m;keyCb=k;order.callbackSetAt=++seq;}
    connectBleDevice(dev){
      order.connectCalledAt=++seq;
      return new Promise(res=>setTimeout(()=>{
        res(dev);
        setTimeout(()=>msgCb&&msgCb(dev,"Connected"),30);   /* 실기기처럼 비동기 Connected */
      },20));
    }
    displayLineData(lineId,startCell,hex,mode,dev){log.push({dev,lineId,startCell,hex,mode,t:Date.now()});}
    disconnect(dev){setTimeout(()=>msgCb&&msgCb(dev,"Disconnected"),10);}
  }
  class DotPadScanner{
    startBleScan(){return Promise.resolve({id:"SIM-"+Math.random().toString(36).slice(2,7),name:"DotPad320-SIM"});}
  }
  return {
    module:{DotPadSDK,DotPadScanner,DisplayMode:{GraphicMode:"GraphicMode",TextMode:"TextMode"}},
    log,order,
    fireKey(key,dev){keyCb&&keyCb(dev||(log.length?log[log.length-1].dev:null),key);},
    fireMessage(code,dev){msgCb&&msgCb(dev,code);},
    deviceState(){
      const last={};
      log.forEach(x=>{if(x.mode==="GraphicMode")last[x.lineId-1]=x.hex;});
      return [...Array(10)].map((_,i)=>last[i]||"0".repeat(60));
    }
  };
}

/* 10행 hex(행당 30바이트) → 셀별 점 배열. 검증 인코딩: bit = y%4 + (x%2)*4, 셀 피치 3×4px */
function rowsToCells(rowHexes){
  const buf=[];
  for(let gy=0;gy<10;gy++){
    const hex=rowHexes[gy];if(!hex)continue;
    for(let gx=0;gx<30;gx++){
      const b=parseInt(hex.substr(gx*2,2),16);
      for(let r=0;r<4;r++){
        if(b&(1<<r))buf[(gy*4+r)*60+gx*2]=1;
        if(b&(1<<(r+4)))buf[(gy*4+r)*60+gx*2+1]=1;
      }
    }
  }
  const POS={"0,0":1,"0,1":2,"0,2":3,"1,0":4,"1,1":5,"1,2":6,"0,3":7,"1,3":8};
  const cells=[];
  for(let line=0;line<10;line++)for(let c=0;c<20;c++){
    const dots=[];
    for(const k in POS){
      const [dx,dy]=k.split(",").map(Number);
      if(buf[(line*4+dy)*60+(c*3+dx)])dots.push(POS[k]);
    }
    cells.push(dots.sort((a,b)=>a-b));
  }
  while(cells.length&&!cells[cells.length-1].length)cells.pop();
  return cells;
}

function makeChecker(){
  let pass=0,fail=0;
  return {
    ok(name,cond,extra){
      if(cond){pass++;console.log("  ✔",name);}
      else{fail++;console.log("  ✘",name,extra!==undefined?("→ "+extra):"");}
    },
    get fail(){return fail;},
    summary(){console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);return fail?1:0;}
  };
}

module.exports={createMockSdk,rowsToCells,makeChecker};
