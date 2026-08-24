import { HeadlessEngineCommandWrapperEffect } from '@/command-menu-item/engine-command/components/HeadlessEngineCommandWrapperEffect';
import { useOpenLeadRegistrationImportDialog } from '@/object-record/record-index/import/hooks/useOpenLeadRegistrationImportDialog';

export const ImportLeadsAfterRegistrationCommand = () => {
  const { openLeadRegistrationImportDialog } =
    useOpenLeadRegistrationImportDialog();

  return (
    <HeadlessEngineCommandWrapperEffect
      execute={openLeadRegistrationImportDialog}
    />
  );
};
