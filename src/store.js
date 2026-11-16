export function createSession(scenario) {
  return {
    scenario: structuredClone(scenario),
    comparison: null,
    activePlan: null,
    actualMetrics: null,
    executionComplete: false,
  };
}

export function createScenarioStore() {
  const sessions = new Map();

  return {
    add(session) {
      sessions.set(session.scenario.id, session);
      return session;
    },
    get(id) {
      return sessions.get(id) ?? null;
    },
    replace(session) {
      if (!sessions.has(session.scenario.id)) return false;
      sessions.set(session.scenario.id, session);
      return true;
    },
    delete(id) {
      return sessions.delete(id);
    },
  };
}
