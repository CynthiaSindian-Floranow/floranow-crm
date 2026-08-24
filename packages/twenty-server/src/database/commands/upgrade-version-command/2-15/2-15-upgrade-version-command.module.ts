import { Module } from '@nestjs/common';

import { WorkspaceIteratorModule } from 'src/database/commands/command-runners/workspace-iterator.module';
import { AddExportLeadsForRegistrationCommandMenuItemCommand } from 'src/database/commands/upgrade-version-command/2-15/2-15-workspace-command-1781461800000-add-export-leads-for-registration-command-menu-item.command';
import { AddImportLeadsAfterRegistrationCommandMenuItemCommand } from 'src/database/commands/upgrade-version-command/2-15/2-15-workspace-command-1781461810000-add-import-leads-after-registration-command-menu-item.command';
import { ApplicationModule } from 'src/engine/core-modules/application/application.module';
import { WorkspaceCacheModule } from 'src/engine/workspace-cache/workspace-cache.module';
import { WorkspaceMigrationModule } from 'src/engine/workspace-manager/workspace-migration/workspace-migration.module';

@Module({
  imports: [
    ApplicationModule,
    WorkspaceCacheModule,
    WorkspaceIteratorModule,
    WorkspaceMigrationModule,
  ],
  providers: [
    AddExportLeadsForRegistrationCommandMenuItemCommand,
    AddImportLeadsAfterRegistrationCommandMenuItemCommand,
  ],
})
export class V2_15_UpgradeVersionCommandModule {}
