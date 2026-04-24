(() => {
  if (window.NEXIDIA_TOOLS) return;
  const tools = [];
  const shared = {};
  window.NEXIDIA_TOOLS = {
    registerTool(tool) {
      if (!tool || !tool.id || !tool.label || typeof tool.open !== "function") return;
      if (tools.some(t => t.id === tool.id)) return;
      tools.push(tool);
    },
    listTools() {
      return tools.slice();
    },
    setShared(key, val) {
      shared[key] = val;
    },
    getShared(key) {
      return shared[key];
    }
  };
})();
