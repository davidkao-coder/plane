/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Client / contract metadata section – TMS Phase 2.
 * Lets PM record which customer a project belongs to.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Input } from "@plane/ui";
// hooks
import { useProject } from "@/hooks/store/use-project";

type Props = {
  workspaceSlug: string;
  projectId: string;
  isAdmin: boolean;
};

export const ClientInfoSection = observer(function ClientInfoSection({ workspaceSlug, projectId, isAdmin }: Props) {
  const { getProjectById, updateProject } = useProject();
  const project = getProjectById(projectId);

  const [clientName, setClientName] = useState("");
  const [contractNo, setContractNo] = useState("");
  const [clientPic, setClientPic] = useState("");
  const [clientContact, setClientContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (project) {
      setClientName(project.client_name ?? "");
      setContractNo(project.contract_no ?? "");
      setClientPic(project.client_pic ?? "");
      setClientContact(project.client_contact ?? "");
      setDirty(false);
    }
  }, [project]);

  const onChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value);
    setDirty(true);
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      await updateProject(workspaceSlug, projectId, {
        client_name: clientName,
        contract_no: contractNo,
        client_pic: clientPic,
        client_contact: clientContact,
      });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已儲存", message: "客戶資訊已更新" });
      setDirty(false);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "儲存失敗", message: "請再試一次" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-subtle py-6">
      <div className="mb-4">
        <h3 className="text-15 font-semibold text-primary">客戶資訊</h3>
        <p className="text-12 text-tertiary mt-0.5">記錄此專案對應的客戶、合約與聯絡窗口</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
        <div>
          <label className="text-12 font-medium text-secondary mb-1 block">客戶名稱</label>
          <Input
            value={clientName}
            onChange={onChange(setClientName)}
            placeholder="例：太平洋崇光百貨"
            disabled={!isAdmin}
            className="w-full"
          />
        </div>
        <div>
          <label className="text-12 font-medium text-secondary mb-1 block">合約編號</label>
          <Input
            value={contractNo}
            onChange={onChange(setContractNo)}
            placeholder="例：CT-2026-001"
            disabled={!isAdmin}
            className="w-full"
          />
        </div>
        <div>
          <label className="text-12 font-medium text-secondary mb-1 block">客戶窗口（PIC）</label>
          <Input
            value={clientPic}
            onChange={onChange(setClientPic)}
            placeholder="例：王經理"
            disabled={!isAdmin}
            className="w-full"
          />
        </div>
        <div>
          <label className="text-12 font-medium text-secondary mb-1 block">聯絡方式</label>
          <Input
            value={clientContact}
            onChange={onChange(setClientContact)}
            placeholder="email / 電話"
            disabled={!isAdmin}
            className="w-full"
          />
        </div>
      </div>
      {isAdmin && (
        <div className="mt-4">
          <Button variant="primary" size="sm" onClick={handleSave} loading={busy} disabled={!dirty}>
            儲存客戶資訊
          </Button>
        </div>
      )}
    </div>
  );
});
