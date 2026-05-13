import { registerProjection } from "../../projections/runner";
import { CompanySettings } from "./company.types";

export const companySettings: CompanySettings = {
  name: "",
  address: "",
  city: "",
  vatId: "",
};

export function initCompanyProjection(): void {
  registerProjection("company-info", "company-settings", (event) => {
    if (event.type === "CompanySettingsUpdated") {
      Object.assign(companySettings, event.data);
    }
  });
}
