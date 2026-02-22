// Copyright (c) 2026 Esper.io — MIT License
// See LICENSE in the repository root.

import { LightningElement, api, wire } from "lwc";
import { getRecord, getFieldValue } from "lightning/uiRecordApi";
import getDeviceBySerial from "@salesforce/apex/EsperDeviceController.getDeviceBySerial";
import sendDeviceCommand from "@salesforce/apex/EsperDeviceController.sendDeviceCommand";
import { ShowToastEvent } from "lightning/platformShowToastEvent";

// Custom field on Case — update this if you used a different API name
import SERIAL_FIELD from "@salesforce/schema/Case.Device_Serial__c";

export default class EsperDevicePanel extends LightningElement {
  @api recordId;

  device = null;
  loading = true;

  // ── Wire: read the serial from the Case record ────────────────────

  @wire(getRecord, { recordId: "$recordId", fields: [SERIAL_FIELD] })
  wiredCase({ data, error }) {
    if (data) {
      const serial = getFieldValue(data, SERIAL_FIELD);
      if (serial) {
        this.loadDevice(serial);
      } else {
        this.loading = false;
      }
    } else if (error) {
      console.error("Error loading case:", error);
      this.loading = false;
    }
  }

  // ── Load device from Esper ────────────────────────────────────────

  async loadDevice(serial) {
    this.loading = true;
    try {
      const result = await getDeviceBySerial({ serialNumber: serial });
      this.device = result;
    } catch (e) {
      console.error("Esper device lookup failed:", e);
    } finally {
      this.loading = false;
    }
  }

  // ── Action handlers ───────────────────────────────────────────────

  handleRemoteView() {
    if (this.device && this.device.consoleLink) {
      window.open(this.device.consoleLink, "_blank");
    }
  }

  async handleReboot() {
    await this.executeCommand("REBOOT", "Reboot");
  }

  async handlePing() {
    await this.executeCommand("UPDATE_HEARTBEAT", "Ping");
  }

  async executeCommand(command, label) {
    if (!this.device) return;
    try {
      await sendDeviceCommand({
        deviceId: this.device.id,
        command: command,
      });
      this.dispatchEvent(
        new ShowToastEvent({
          title: `${label} sent`,
          message: `${label} command sent to ${this.device.name}`,
          variant: "success",
        })
      );
    } catch (e) {
      this.dispatchEvent(
        new ShowToastEvent({
          title: `${label} failed`,
          message: e.body?.message || "An error occurred",
          variant: "error",
        })
      );
    }
  }

  // ── Computed properties ───────────────────────────────────────────

  get statusLabel() {
    return this.device?.state === 1 ? "Online" : "Offline";
  }

  get statusClass() {
    return this.device?.state === 1 ? "slds-theme_success" : "slds-theme_error";
  }

  get deviceModel() {
    const hw = this.device?.hardware_info;
    return hw ? `${hw.brand} ${hw.model}` : "Unknown";
  }

  get lastSeenFormatted() {
    if (!this.device?.last_seen) return "Unknown";
    const diff = Date.now() - new Date(this.device.last_seen).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  get showNoDevice() {
    return !this.loading && !this.device;
  }
}
