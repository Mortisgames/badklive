export let S={};
export function commitSnapshot(snapshot,receivedAt){
  S={...snapshot,receivedAt,feed:S.feed};
}
