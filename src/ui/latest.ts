/**
 * Numbers the requests of one screen so only the newest one's answer is used: when a refresh starts before an earlier
 * load answered, the earlier answer is dropped even if it arrives last.
 */
export function latestRequests() {
  let newest = 0;
  return {
    /** Start a request. The check it returns stays true while no later request has started and nothing cancelled it. */
    start(): () => boolean {
      const mine = ++newest;
      return () => mine === newest;
    },
    /** Drop every answer still on its way, as when the screen goes away. */
    cancel() {
      newest += 1;
    },
  };
}
