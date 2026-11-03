export function summarizeKeyboardCpuProfile(profile) {
  const parents = new Map(),
    nodes = new Map(profile.nodes.map((node) => [node.id, node])),
    totals = new Map();
  const keyOf = (node) =>
    `${node.callFrame.functionName}@${node.callFrame.url}:${node.callFrame.lineNumber}`;
  for (const node of profile.nodes)
    for (const child of node.children ?? []) parents.set(child, node.id);
  const add = (node, ms, field) => {
    const c = node.callFrame,
      key = keyOf(node);
    let entry = totals.get(key);
    if (!entry) {
      entry = {
        function: c.functionName || "(anonymous)",
        url: c.url.replace(/^http:\/\/127\.0\.0\.1:\d+/, ""),
        line: c.lineNumber + 1,
        selfMs: 0,
        inclusiveMs: 0,
      };
      totals.set(key, entry);
    }
    entry[field] += ms;
  };
  for (let index = 0; index < (profile.samples?.length ?? 0); index++) {
    const ms = (profile.timeDeltas?.[index] ?? 0) / 1000,
      seen = new Set();
    let id = profile.samples[index],
      first = true;
    while (id && nodes.has(id)) {
      const node = nodes.get(id),
        key = keyOf(node);
      if (first) add(node, ms, "selfMs");
      if (!seen.has(key)) {
        add(node, ms, "inclusiveMs");
        seen.add(key);
      }
      first = false;
      id = parents.get(id);
    }
  }
  const sampleTimeMs =
    (profile.timeDeltas ?? []).reduce((sum, value) => sum + value, 0) / 1000;
  const values = [...totals.values()].filter(
    (item) => !["(idle)", "(root)"].includes(item.function),
  );
  return {
    sampleTimeMs,
    topSelf: [...values].sort((a, b) => b.selfMs - a.selfMs).slice(0, 30),
    topInclusive: [...values]
      .sort((a, b) => b.inclusiveMs - a.inclusiveMs)
      .slice(0, 30),
  };
}
