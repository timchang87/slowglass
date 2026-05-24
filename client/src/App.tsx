import axios from 'axios';
import { FC, useEffect } from 'react';
import { TopNavigationBar } from './components/TopNavigationBar/TopNavigationBar';
import { SideNavigationBar } from './components/SideNavigationBar/SideNavigationBar';

const App: FC = () => {
  useEffect(() => {
    axios
      .get('/api/test')
      .then((response) => response.data)
      .then((data) => console.log(data));
  }, []);

  return (
    <>
      <TopNavigationBar />
      <SideNavigationBar />
    </>
  );
};

export default App;
