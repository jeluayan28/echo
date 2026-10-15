import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

import { useCollections, useProfile, useReminder } from '../hooks';
import { store } from '../store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A hook subscribes to the slice of the cache it reads, so an unrelated update must not re-render it. */
describe('data hooks re-render only for their own slice', () => {
  it('ignores updates to other parts of the store', () => {
    store.reset();
    const renders = { collections: 0, profile: 0, reminder: 0 };
    const Collections = () => (useCollections(), renders.collections++, <Text>c</Text>);
    const Profile = () => (useProfile(), renders.profile++, <Text>p</Text>);
    const Reminder = () => (useReminder('m1'), renders.reminder++, <Text>r</Text>);

    act(() => {
      TestRenderer.create(
        <>
          <Collections />
          <Profile />
          <Reminder />
        </>,
      );
    });
    expect(renders).toEqual({ collections: 1, profile: 1, reminder: 1 });

    act(() => store.dismissRediscovery('m1'));
    act(() => store.setTags([]));
    expect(renders).toEqual({ collections: 1, profile: 1, reminder: 1 });

    act(() => store.setProfile({ name: 'Ada' }));
    expect(renders).toEqual({ collections: 1, profile: 2, reminder: 1 });
  });
});
