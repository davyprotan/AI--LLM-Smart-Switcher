import { REPAIR_ACTIONS } from "../data/mockData";

export async function listRepairActions() {
  return {
    actions: REPAIR_ACTIONS,
    source: "mock",
  };
}

