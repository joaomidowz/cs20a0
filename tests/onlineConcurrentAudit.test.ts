import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RoomManager, CONFIRMATION_GRACE_MS } from '../server/room-manager';
import { advanceFeedCursor, initialDelivery, planBroadcast } from '../server/broadcast';
import { DEFAULT_ROOM_CONFIG } from '../src/lib/game/online/contracts';

/** Local CPU/serialization workload; not a browser or network capacity claim. */
describe('concurrent online rooms audit', () => {
  it.each([{ rooms: 1, players: 4 }, { rooms: 1, players: 16 }, { rooms: 4, players: 16 }, { rooms: 10, players: 16 }])('ticks and broadcasts %j', ({rooms, players}) => {
    const manager = new RoomManager();
    let now = 1_000_000;
    const sessions = Array.from({length: rooms}, (_, r) => {
      const code = manager.createRoom({...DEFAULT_ROOM_CONFIG, capacity: players, draftDeadlineSeconds:60, simulationSpeed:'ultra'}, now, `concurrent-${r}`);
      const ids = Array.from({length:players},(_,p)=>manager.join(code,`Player ${p}`,`Org ${p}`,now+p).participantId);
      manager.execute(code, ids[0],{type:'start',requestId:`concurrent-start-${r}`},now);
      return {code, clients:ids.map(id=>({id,delivery:initialDelivery()}))};
    });
    now+=61_000;manager.tick(now);
    now+=CONFIRMATION_GRACE_MS+100;manager.tick(now);
    let bytes=0,lives=0,snapshots=0;
    const cycleMs:number[]=[];
    for(let tick=0;tick<1000;tick++) {
      now+=100;
      const start=performance.now();
      manager.tick(now);
      for(const room of sessions) {
        for(const client of room.clients) {
          const live=manager.getLiveUpdate(room.code,client.id,now);
          const decision=live.cursor.primarySeries?.decision;
          if(!decision || decision.teamId!==client.id || !live.pendingDecision)continue;
          const seriesId=live.pendingDecision.seriesId;
          const requestId=`load-${tick}-${client.id}`;
          if(decision.kind==='veto')manager.execute(room.code,client.id,{type:'veto-action',requestId,seriesId,action:decision.action,mapId:decision.available[0],step:decision.step},now);
          else if(decision.kind==='side')manager.execute(room.code,client.id,{type:'pick-side',requestId,seriesId,side:'ct'},now);
          else manager.execute(room.code,client.id,{type:'eco-call',requestId,seriesId,call:'force'},now);
        }
        const versions=manager.getVersions(room.code);
        for(const client of room.clients) {
          const plan=planBroadcast(client.delivery,versions,0,64*1024);
          if(plan==='snapshot') {
            const snapshot=manager.getSnapshot(room.code,client.id,now);
            bytes+=Buffer.byteLength(JSON.stringify({type:'snapshot',snapshot}));snapshots++;
            client.delivery={sentVersion:snapshot.version,sentStateVersion:versions.stateVersion,feedCursor:advanceFeedCursor(client.delivery.feedCursor,snapshot.tournament?.liveCursor?.primarySeries??null)};
          } else if(plan==='live') {
            const live=manager.getLiveUpdate(room.code,client.id,now,client.delivery.feedCursor);
            bytes+=Buffer.byteLength(JSON.stringify({type:'live',live}));lives++;
            client.delivery={...client.delivery,sentVersion:live.version,feedCursor:advanceFeedCursor(client.delivery.feedCursor,live.cursor.primarySeries)};
          }
        }
      }
      cycleMs.push(performance.now()-start);
    }
    for(const room of sessions) {
      const version=manager.getVersion(room.code);
      expect(room.clients.every(c=>c.delivery.sentVersion===version)).toBe(true);
    }
    expect(lives).toBeGreaterThan(rooms*players*10);
    cycleMs.sort((a,b)=>a-b);
    const report={rooms,players,connections:rooms*players,simulatedSeconds:100,bytes,lives,snapshots,p50Ms:cycleMs[500],p95Ms:cycleMs[950],p99Ms:cycleMs[990],maxMs:cycleMs.at(-1)};
    if(process.env.ONLINE_LOAD_REPORT)appendFileSync(process.env.ONLINE_LOAD_REPORT,JSON.stringify(report)+'\n');
  },60_000);
});
