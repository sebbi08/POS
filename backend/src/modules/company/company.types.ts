export interface CompanySettings {
  name: string;
  address: string;
  city: string;
  vatId: string;
}

export interface CompanySettingsUpdatedEvent extends CompanySettings {}
