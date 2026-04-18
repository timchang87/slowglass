import { FC } from 'react';
import * as NavigationMenu from '@radix-ui/react-navigation-menu';
import styles from './side-navigation-bar.module.css';

export const SideNavigationBar: FC = () => {
  const { Root } = NavigationMenu;
  return <Root className={styles.sideNavBar} orientation="vertical"></Root>;
};
