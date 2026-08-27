import { LOCALITY_OPTIONS_SHOWN_LIMIT } from '@/localities/constants/LocalityOptionsShownLimit';
import { useLocalityDataset } from '@/localities/hooks/useLocalityDataset';
import { useLocalityField } from '@/localities/hooks/useLocalityField';
import {
  getLocalityOptions,
  type LocalityOption,
} from '@/localities/utils/getLocalityOptions';
import { resolveLocalitySelection } from '@/localities/utils/resolveLocalitySelection';
import { FieldInputEventContext } from '@/object-record/record-field/ui/contexts/FieldInputEventContext';
import { RecordFieldComponentInstanceContext } from '@/object-record/record-field/ui/states/contexts/RecordFieldComponentInstanceContext';
import { DropdownContent } from '@/ui/layout/dropdown/components/DropdownContent';
import { DropdownMenuItemsContainer } from '@/ui/layout/dropdown/components/DropdownMenuItemsContainer';
import { DropdownMenuSearchInput } from '@/ui/layout/dropdown/components/DropdownMenuSearchInput';
import { DropdownMenuSeparator } from '@/ui/layout/dropdown/components/DropdownMenuSeparator';
import { SelectableList } from '@/ui/layout/selectable-list/components/SelectableList';
import { SelectableListItem } from '@/ui/layout/selectable-list/components/SelectableListItem';
import { selectedItemIdComponentState } from '@/ui/layout/selectable-list/states/selectedItemIdComponentState';
import { useHotkeysOnFocusedElement } from '@/ui/utilities/hotkey/hooks/useHotkeysOnFocusedElement';
import { useListenClickOutside } from '@/ui/utilities/pointer-event/hooks/useListenClickOutside';
import { useAvailableComponentInstanceIdOrThrow } from '@/ui/utilities/state/component-state/hooks/useAvailableComponentInstanceIdOrThrow';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { t } from '@lingui/core/macro';
import { useContext, useMemo, useRef, useState } from 'react';
import { Key } from 'ts-key-enum';
import { isDefined } from 'twenty-shared/utils';
import { MenuItem, MenuItemSelectTag } from 'twenty-ui-deprecated/navigation';
import { normalizeSearchText } from '~/utils/normalizeSearchText';

const SELECTABLE_LIST_INSTANCE_ID = 'locality-select-field-input';

const getOptionId = (option: LocalityOption) =>
  `${option.values.country}/${option.values.state}/${option.values.city}`;

const getOptionText = (option: LocalityOption) =>
  isDefined(option.context)
    ? `${option.label} · ${option.context}`
    : option.label;

export const LocalitySelectFieldInput = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [searchFilter, setSearchFilter] = useState('');

  const { onCancel } = useContext(FieldInputEventContext);
  const { kind, values, persistLocality } = useLocalityField();
  const dataset = useLocalityDataset();

  const instanceId = useAvailableComponentInstanceIdOrThrow(
    RecordFieldComponentInstanceContext,
  );

  const selectedItemId = useAtomComponentStateValue(
    selectedItemIdComponentState,
    SELECTABLE_LIST_INSTANCE_ID,
  );

  // The country and state already on the record narrow what this dropdown
  // offers: state lists only that country's states, city only that state's
  // cities.
  const selection = useMemo(
    () =>
      isDefined(dataset)
        ? resolveLocalitySelection(dataset, values)
        : { countryCode: undefined, stateIndex: undefined },
    [dataset, values],
  );

  const allOptions = useMemo(
    () =>
      isDefined(dataset) && isDefined(kind)
        ? getLocalityOptions(dataset, kind, selection)
        : [],
    [dataset, kind, selection],
  );

  // Normalising 24k labels on every keystroke is what makes a city search feel
  // slow, so it happens once per option list instead.
  const searchableOptions = useMemo(
    () =>
      allOptions.map((option) => ({
        option,
        searchText: normalizeSearchText(getOptionText(option)),
      })),
    [allOptions],
  );

  const matchingOptions = useMemo(() => {
    const searchTerm = normalizeSearchText(searchFilter);

    if (searchTerm === '') {
      return allOptions;
    }

    return searchableOptions
      .filter(({ searchText }) => searchText.includes(searchTerm))
      .map(({ option }) => option);
  }, [allOptions, searchableOptions, searchFilter]);

  const shownOptions = matchingOptions.slice(0, LOCALITY_OPTIONS_SHOWN_LIMIT);
  const hiddenOptionCount = matchingOptions.length - shownOptions.length;

  const currentValue = isDefined(kind) ? values[kind] : '';

  const handleOptionSelected = async (option: LocalityOption) => {
    await persistLocality(option.values);

    onCancel?.();
  };

  const handleClear = async () => {
    if (!isDefined(kind)) {
      return;
    }

    // Clearing a level clears the ones below it, so the trio stays coherent:
    // a city without its country would be meaningless.
    await persistLocality({
      country: kind === 'country' ? '' : values.country,
      state: kind === 'city' ? values.state : '',
      city: '',
    });

    onCancel?.();
  };

  useHotkeysOnFocusedElement({
    keys: [Key.Escape],
    callback: () => onCancel?.(),
    focusId: instanceId,
    dependencies: [onCancel],
  });

  useListenClickOutside({
    refs: [containerRef],
    callback: (event) => {
      event.stopImmediatePropagation();
      event.preventDefault();

      const isClickInsideAnInput =
        event.target instanceof HTMLInputElement &&
        event.target.tagName === 'INPUT';

      if (!isClickInsideAnInput) {
        onCancel?.();
      }
    },
    listenerId: SELECTABLE_LIST_INSTANCE_ID,
  });

  return (
    <SelectableList
      selectableListInstanceId={SELECTABLE_LIST_INSTANCE_ID}
      selectableItemIdArray={shownOptions.map(getOptionId)}
      focusId={instanceId}
    >
      <DropdownContent ref={containerRef} selectDisabled>
        <DropdownMenuSearchInput
          value={searchFilter}
          onChange={(event) => setSearchFilter(event.target.value)}
          autoFocus
        />
        <DropdownMenuSeparator />
        <DropdownMenuItemsContainer hasMaxHeight>
          {!isDefined(dataset) ? (
            <MenuItem text={t`Loading…`} />
          ) : (
            <>
              {currentValue !== '' && (
                <SelectableListItem itemId="clear" onEnter={handleClear}>
                  <MenuItemSelectTag
                    text={t`Clear`}
                    color="transparent"
                    variant="outline"
                    onClick={handleClear}
                    isKeySelected={selectedItemId === 'clear'}
                  />
                </SelectableListItem>
              )}
              {shownOptions.map((option) => {
                const optionId = getOptionId(option);

                return (
                  <SelectableListItem
                    key={optionId}
                    itemId={optionId}
                    onEnter={() => handleOptionSelected(option)}
                  >
                    <MenuItemSelectTag
                      selected={
                        isDefined(kind) && option.values[kind] === currentValue
                      }
                      text={getOptionText(option)}
                      color="transparent"
                      onClick={() => handleOptionSelected(option)}
                      isKeySelected={selectedItemId === optionId}
                    />
                  </SelectableListItem>
                );
              })}
              {shownOptions.length === 0 && <MenuItem text={t`No results`} />}
            </>
          )}
        </DropdownMenuItemsContainer>
        {hiddenOptionCount > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItemsContainer scrollable={false}>
              <MenuItem text={t`${hiddenOptionCount} more — keep typing`} />
            </DropdownMenuItemsContainer>
          </>
        )}
      </DropdownContent>
    </SelectableList>
  );
};
