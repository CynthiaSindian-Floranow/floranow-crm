import {
  IconBuildingSkyscraper,
  IconCalendarEvent,
  IconCheckbox,
  type IconComponent,
  IconFileText,
  IconHeart,
  IconLayoutDashboard,
  IconNotes,
  IconRocket,
  IconStar,
  IconTargetArrow,
  IconUser,
  IconUserCircle,
} from 'twenty-ui-deprecated/display';
import { type ThemeColor } from 'twenty-ui-deprecated/theme';

export type BackgroundMockNavigationItem = {
  label: string;
  Icon: IconComponent;
  color: ThemeColor;
};

export const BACKGROUND_MOCK_WORKSPACE_ITEMS = [
  { label: 'Companies', Icon: IconBuildingSkyscraper, color: 'blue' },
  { label: 'People', Icon: IconUser, color: 'blue' },
  { label: 'Opportunities', Icon: IconTargetArrow, color: 'red' },
  { label: 'Tasks', Icon: IconCheckbox, color: 'turquoise' },
  { label: 'Notes', Icon: IconNotes, color: 'turquoise' },
  { label: 'Dashboards', Icon: IconLayoutDashboard, color: 'orange' },
  { label: 'Workflows', Icon: IconRocket, color: 'pink' },
  { label: 'Orders', Icon: IconFileText, color: 'sky' },
  { label: 'Bouquets', Icon: IconHeart, color: 'orange' },
  { label: 'Florists', Icon: IconUserCircle, color: 'yellow' },
  { label: 'Growers', Icon: IconStar, color: 'green' },
  { label: 'Deliveries', Icon: IconTargetArrow, color: 'purple' },
  { label: 'Events', Icon: IconCalendarEvent, color: 'red' },
] satisfies BackgroundMockNavigationItem[];
