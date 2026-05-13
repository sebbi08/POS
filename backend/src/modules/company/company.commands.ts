import { appendEvent } from "../../eventstore/client";
import { CompanySettingsUpdatedEvent } from "./company.types";

const STREAM = "company-settings";

export async function updateCompanySettings(
  name: string,
  address: string,
  city: string,
  vatId: string
): Promise<void> {
  const data: CompanySettingsUpdatedEvent = { name, address, city, vatId };
  await appendEvent(STREAM, "CompanySettingsUpdated", data as unknown as Record<string, unknown>);
}
