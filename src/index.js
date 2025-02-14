import {
    createPrompt,
    useState,
    useKeypress,
    usePrefix,
    usePagination,
    useRef,
    useMemo,
    isBackspaceKey,
    isEnterKey,
    isUpKey,
    isDownKey,
    isNumberKey,
    Separator,
    ValidationError,
    makeTheme,
} from '@inquirer/core';
import chalk from 'chalk';
import figures from 'figures';
import ansiEscapes from 'ansi-escapes';

const selectTheme = {
    icon: { cursor: figures.pointer },
    style: { disabled: (text) => chalk.dim(`- ${text}`) },
};

function isSelectable(item) {
    return !Separator.isSeparator(item) && !item.disabled;
}

export default createPrompt(
    (config, done) => {
        const { choices: items, loop = true, pageSize = 7 } = config;
        const firstRender = useRef(true);
        const theme = makeTheme(selectTheme, config.theme);
        const prefix = usePrefix({ theme });
        const [status, setStatus] = useState('pending');
        const searchTimeoutRef = useRef(undefined);

        const bounds = useMemo(() => {
            const first = items.findIndex(isSelectable);
            const last = items.findLastIndex(isSelectable);

            if (first < 0) {
                throw new ValidationError(
                    '[select prompt] No selectable choices. All choices are disabled.',
                );
            }

            return { first, last };
        }, [items]);

        const defaultItemIndex = useMemo(() => {
            if (!('default' in config)) return -1;
            return items.findIndex(
                (item) => isSelectable(item) && item.value === config.default,
            );
        }, [config.default, items]);

        const [active, setActive] = useState(
            defaultItemIndex === -1 ? bounds.first : defaultItemIndex,
        );

        const [selectedAction, setSelectedAction] = useState(undefined);

        const selectedChoice = items[active];

        useKeypress((key, rl) => {
            clearTimeout(searchTimeoutRef.current);

            const action = config.actions.find(action => action.key === key.name);
            if (action !== undefined) {
                setStatus('done');
                setSelectedAction(action);
                done({
                    action: action.value,
                    answer: selectedChoice.value
                });
            } else if (isEnterKey(key)) {
                setStatus('done');
                done({
                    action: undefined,
                    answer: selectedChoice.value
                });
            } else if (isUpKey(key) || isDownKey(key)) {
                rl.clearLine(0);
                if (
                    loop ||
                    (isUpKey(key) && active !== bounds.first) ||
                    (isDownKey(key) && active !== bounds.last)
                ) {
                    const offset = isUpKey(key) ? -1 : 1;
                    let next = active;
                    do {
                        next = (next + offset + items.length) % items.length;
                    } while (!isSelectable(items[next]));
                    setActive(next);
                }
            } else if (isNumberKey(key)) {
                rl.clearLine(0);
                const position = Number(key.name) - 1;
                const item = items[position];
                if (item != null && isSelectable(item)) {
                    setActive(position);
                }
            } else if (isBackspaceKey(key)) {
                rl.clearLine(0);
            } else {
                const searchTerm = rl.line.toLowerCase();
                const matchIndex = items.findIndex((item) => {
                    if (Separator.isSeparator(item) || !isSelectable(item)) return false;

                    return String(item.name || item.value)
                        .toLowerCase()
                        .startsWith(searchTerm);
                });

                if (matchIndex >= 0) {
                    setActive(matchIndex);
                }

                searchTimeoutRef.current = setTimeout(() => {
                    rl.clearLine(0);
                }, 700);
            }
        });

        const message = theme.style.message(config.message);

        const helpTip = config.actions.map(action => `${theme.style.help(action.name)} ${theme.style.key(action.key.toUpperCase())}`).join(' ');

        const page = usePagination({
            items,
            active,
            renderItem({ item, isActive }) {
                if (Separator.isSeparator(item)) {
                    return ` ${item.separator}`;
                }

                const line = item.name || item.value;
                if (item.disabled) {
                    const disabledLabel =
                        typeof item.disabled === 'string' ? item.disabled : '(disabled)';
                    return theme.style.disabled(`${line} ${disabledLabel}`);
                }

                const color = isActive ? theme.style.highlight : (x) => x;
                const cursor = isActive ? theme.icon.cursor : ` `;
                return color(`${cursor} ${line}`);
            },
            pageSize,
            loop,
            theme,
        });

        if (status === 'done') {
            const answer =
                selectedChoice.name ||
                String(selectedChoice.value);

            if (selectedAction !== undefined) {
                const action =
                    selectedAction.name ||
                    String(selectedAction.value);
                return `${prefix} ${message} ${theme.style.help(action)} ${theme.style.answer(answer)}`;
            } else {
                return `${prefix} ${message} ${theme.style.answer(answer)}`;
            }
        }

        const choiceDescription = selectedChoice.description
            ? `\n${selectedChoice.description}`
            : ``;

        return `${[prefix, message, helpTip].filter(Boolean).join(' ')}\n${page}${choiceDescription}${ansiEscapes.cursorHide}`;
    },
);

export { Separator }; 